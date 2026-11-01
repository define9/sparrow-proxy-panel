import 'server-only'
import type { AuditContext } from '@/lib/api/audit'
import { writeAudit } from '@/lib/api/audit'
import { ApiError } from '@/lib/api/response'
import {
  readPaymentSettings,
  writePaymentSettings
} from '@/lib/services/settings'
import {
  isGatewayComplete,
  mergeGatewayState,
  missingRequiredFields,
  toGatewayView,
  type GatewayPatch
} from './config'
import {
  getGatewayDefinition,
  isGatewayImplemented,
  listGatewayDefinitions
} from './registry'
import type {
  GatewayConfig,
  GatewayList,
  GatewayTestCheck,
  GatewayTestResult,
  GatewayView
} from './types'

export type { FieldSpec, FieldType, GatewayDefinition, GatewayConfig } from './types'
export type {
  GatewayList,
  GatewayTestCheck,
  GatewayTestResult,
  GatewayView,
  PaymentMode,
  PaymentSettings
} from './types'
export { listGatewayDefinitions, getGatewayDefinition, isGatewayImplemented } from './registry'
export {
  MASK,
  isGatewayComplete,
  mergeGatewayState,
  missingRequiredFields,
  normalizePaymentSettings,
  toGatewayView,
  type GatewayPatch
} from './config'

/**
 * 支付渠道的业务出口。
 *
 * 声明在 registry.ts，读写与脱敏在 config.ts，落库在 lib/services/settings.ts；
 * route handler 只调这里，不直接碰 settings 表。
 */

const PROBE_TIMEOUT_MS = 5000

function requireDefinition(key: string) {
  const definition = getGatewayDefinition(key)
  if (!definition) {
    throw new ApiError(404, 'PAYMENT_GATEWAY_NOT_FOUND', `支付渠道不存在：${key}`)
  }
  return definition
}

function toList(
  settings: Awaited<ReturnType<typeof readPaymentSettings>>
): GatewayList {
  return {
    default: settings.default,
    gateways: listGatewayDefinitions().map((definition) =>
      toGatewayView(definition, settings.gateways[definition.key])
    )
  }
}

/** 管理端列表：声明 + 当前脱敏配置 */
export async function listGateways(): Promise<GatewayList> {
  return toList(await readPaymentSettings())
}

export async function getGateway(key: string): Promise<GatewayView> {
  const definition = requireDefinition(key)
  const settings = await readPaymentSettings()
  return toGatewayView(definition, settings.gateways[definition.key])
}

/**
 * 保存单个渠道的 enabled / config。
 * secret 字段提交 MASK 或空串表示保留原值（见 config.mergeGatewayState）。
 */
export async function saveGateway(
  actor: AuditContext,
  key: string,
  patch: GatewayPatch
): Promise<GatewayList> {
  const definition = requireDefinition(key)
  const settings = await readPaymentSettings()

  const current: GatewayConfig = settings.gateways[definition.key]
  const next = {
    ...settings,
    gateways: {
      ...settings.gateways,
      [definition.key]: mergeGatewayState(definition, current, patch)
    }
  }

  await writePaymentSettings(next)
  await writeAudit(actor, {
    action: 'payment.gateway.update',
    targetType: 'payment_gateway',
    targetId: definition.key,
    message: `更新支付渠道配置：${definition.name}`,
    meta: { enabled: next.gateways[definition.key].enabled }
  })

  return toList(next)
}

/** 设置默认渠道 */
export async function setDefaultGateway(
  actor: AuditContext,
  key: string
): Promise<GatewayList> {
  const definition = requireDefinition(key)
  const settings = await readPaymentSettings()

  const next = { ...settings, default: definition.key }
  await writePaymentSettings(next)
  await writeAudit(actor, {
    action: 'payment.default.update',
    targetType: 'payment',
    targetId: definition.key,
    message: `设置默认支付渠道：${definition.name}`
  })

  return toList(next)
}

async function probeGateway(apiUrl: string): Promise<GatewayTestCheck> {
  const url = apiUrl.replace(/\/$/, '')
  const attempt = async (method: 'HEAD' | 'GET') => {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
    return response
  }

  try {
    let response = await attempt('HEAD')
    // 部分易支付站点不支持 HEAD，退化为 GET 再试一次
    if (response.status === 405 || response.status === 501) response = await attempt('GET')

    if (response.ok) {
      return { name: '网关连通性', ok: true, detail: `HTTP ${response.status}` }
    }
    return { name: '网关连通性', ok: false, detail: `HTTP ${response.status}` }
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.name === 'TimeoutError'
          ? `${PROBE_TIMEOUT_MS}ms 超时`
          : error.message
        : String(error)
    return { name: '网关连通性', ok: false, detail }
  }
}

/**
 * 测试渠道配置：先校验必填项，易支付额外探测网关地址。
 * 连通性失败不算致命（不同网关对 HEAD/鉴权要求不同），只记录 detail。
 */
export async function testGateway(key: string): Promise<GatewayTestResult> {
  const definition = requireDefinition(key)
  const settings = await readPaymentSettings()
  const state = settings.gateways[definition.key]

  const checks: GatewayTestCheck[] = definition.fields
    .filter((field) => field.required)
    .map((field) => {
      const filled = (state.config[field.key] ?? '').trim() !== ''
      return {
        name: field.label,
        ok: filled,
        detail: filled ? '已填写' : '未填写'
      }
    })

  if (definition.key === 'epay' && (state.config.apiUrl ?? '').trim() !== '') {
    checks.push(await probeGateway(state.config.apiUrl))
  }

  const ok = missingRequiredFields(definition, state).length === 0
  return { ok, checks }
}

/**
 * 下单时判定是否走已配置渠道：
 * 默认渠道必须已启用、已实现，且必填项齐全；否则返回 null 走演示网关。
 */
export async function resolveCheckoutGateway(): Promise<string | null> {
  const settings = await readPaymentSettings()
  const definition = getGatewayDefinition(settings.default)
  if (!definition) return null
  if (!isGatewayImplemented(definition.key)) return null

  const state = settings.gateways[definition.key]
  if (!state?.enabled) return null
  if (!isGatewayComplete(definition, state)) return null

  return definition.key
}
