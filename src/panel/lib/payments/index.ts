import 'server-only'
import type { AuditContext } from '@/lib/api/audit'
import { writeAudit } from '@/lib/api/audit'
import { parseJson } from '@/lib/api/admin-ops'
import { ApiError } from '@/lib/api/response'
import { findBuiltinPlugin } from '@/lib/plugin-host/builtin'
import {
  ensureBuiltinPlugins,
  listPluginRows,
  updatePluginRow,
  type PluginRow,
  type PluginRowPatch
} from '@/lib/plugin-host/registry'
import { configSchemaToFields } from '@/lib/plugin-host/schema'
import {
  isSealedSecret,
  openPluginSecret,
  sealPluginSecret
} from '@/lib/plugin-host/secret'
import type { PluginManifest } from '@/lib/plugin-host/types'
import {
  DEFAULT_GATEWAY_KEY,
  extractLegacyPayment,
  paymentDefaultFrom,
  pluginShortId,
  readPaymentSettings,
  writePaymentSettings
} from './config'
import { MASK } from './types'
import type {
  GatewayDefinition,
  GatewayList,
  GatewayPatch,
  GatewayTestCheck,
  GatewayTestResult,
  GatewayView,
  LegacyPaymentPatch,
  LegacyPaymentView
} from './types'

export type { FieldSpec, FieldType } from './types'
export type {
  GatewayDefinition,
  GatewayList,
  GatewayPatch,
  GatewayTestCheck,
  GatewayTestResult,
  GatewayView,
  LegacyPaymentPatch,
  LegacyPaymentView,
  PaymentMode
} from './types'
export { MASK } from './types'
export { DEFAULT_GATEWAY_KEY } from './config'

/**
 * 支付渠道的业务出口。
 *
 * 数据来源是 plugins 表里 type='payment' 的插件：
 * 声明来自 manifest.configSchema，配置存在 plugins.config，
 * 启用状态是 plugins.status（installed = 启用，disabled = 停用）。
 * route handler 只调这里，不直接碰 plugins / settings。
 */

const PROBE_TIMEOUT_MS = 5000

/** 已经实现真实下单链路的渠道；其余只保存配置（不参与结算） */
const IMPLEMENTED_GATEWAYS = new Set(['payment-epay'])

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/* ------------------------- plugins 行 → 接口视图 ------------------------- */

function manifestOf(row: PluginRow): PluginManifest {
  const parsed = parseJson<PluginManifest>(row.manifest)
  if (parsed?.configSchema && typeof parsed.configSchema === 'object') return parsed
  return findBuiltinPlugin(row.key)?.manifest ?? { configSchema: { type: 'object', properties: {} } }
}

function definitionOf(row: PluginRow): GatewayDefinition {
  const builtin = findBuiltinPlugin(row.key)
  const manifest = manifestOf(row)
  const definition: GatewayDefinition = {
    key: row.key,
    name: row.name,
    description: manifest.description ?? builtin?.description ?? row.name,
    fields: configSchemaToFields(manifest.configSchema)
  }

  const docsUrl = manifest.docsUrl ?? builtin?.docsUrl
  if (docsUrl) definition.docsUrl = docsUrl

  const methods = manifest.methods ?? builtin?.manifest.methods
  if (methods) definition.methods = methods

  return definition
}

/** plugins.config（JSON 字符串）→ 落库原样值：secret 字段是密文（v1$...） */
function storedConfig(row: PluginRow): Record<string, string> {
  const parsed = parseJson<Record<string, unknown>>(row.config) ?? {}
  const config: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) config[key] = asString(value)
  return config
}

/** 落库前加密 secret 字段；非 secret 原样存，已在库里是密文的不重复加密 */
function serializeConfig(
  definition: GatewayDefinition,
  config: Record<string, string>
): Record<string, string> {
  const secretKeys = new Set(
    definition.fields.filter((field) => field.secret).map((field) => field.key)
  )
  const stored: Record<string, string> = {}

  for (const [key, value] of Object.entries(config)) {
    stored[key] =
      secretKeys.has(key) && value !== '' && !isSealedSecret(value)
        ? sealPluginSecret(value)
        : value
  }

  return stored
}

/** 服务端内部用的明文配置（探测 / 必填校验），绝不进 HTTP 响应 */
function plainConfig(
  definition: GatewayDefinition,
  stored: Record<string, string>
): Record<string, string> {
  const config: Record<string, string> = {}
  for (const field of definition.fields) {
    const value = stored[field.key] ?? ''
    config[field.key] = field.secret && value ? openPluginSecret(value) : value
  }
  return config
}

function toView(row: PluginRow): GatewayView {
  const definition = definitionOf(row)
  const stored = storedConfig(row)
  const config: Record<string, string> = {}
  let hasSecret = false

  for (const field of definition.fields) {
    const value = stored[field.key] ?? ''
    if (field.secret) {
      if (value) hasSecret = true
      config[field.key] = value ? MASK : ''
    } else {
      config[field.key] = value
    }
  }

  return {
    ...definition,
    id: pluginShortId(row.key),
    enabled: row.status === 'installed',
    config,
    hasSecret
  }
}

/** 前端可能传短名（epay），也可能传插件 key（payment-epay） */
function matchRow(rows: PluginRow[], key: string): PluginRow | undefined {
  const value = key.trim()
  if (!value) return undefined
  return rows.find((row) => row.key === value) ?? rows.find((row) => pluginShortId(row.key) === value)
}

async function requireRow(key: string): Promise<PluginRow> {
  const row = matchRow(await listPluginRows('payment'), key)
  if (!row) {
    throw new ApiError(404, 'PAYMENT_GATEWAY_NOT_FOUND', `支付渠道不存在：${key}`)
  }
  return row
}

/* ------------------------- 启动 / 懒加载 + 数据迁移 ------------------------- */

let paymentReady: Promise<void> | null = null

/**
 * 内置支付插件就位 + 旧 settings.payment 一次性导入。
 * instrumentation.ts 启动时调一次，listGateways() 首次调用再兜一次（构建期/热重载都能自愈）。
 */
export function ensurePaymentPlugins(): Promise<void> {
  if (!paymentReady) {
    paymentReady = preparePaymentPlugins().catch((error: unknown) => {
      paymentReady = null
      throw error
    })
  }
  return paymentReady
}

async function preparePaymentPlugins(): Promise<void> {
  await ensureBuiltinPlugins()
  await migrateLegacyPayment()
}

/**
 * 旧数据在 settings.payment：{ epayEnabled, gateways: { epay: { config } } }
 * （更早还有扁平结构 { epay: { apiUrl, ... } }）。这里只在插件 config 为空时导入，
 * 导入后 settings.payment 只保留 default，迁移自然幂等。
 */
async function migrateLegacyPayment(): Promise<void> {
  const raw = await readPaymentSettings()
  const legacy = extractLegacyPayment(raw)
  const rows = await listPluginRows('payment')
  const storedDefault = paymentDefaultFrom(raw)

  if (legacy.hasLegacy) {
    for (const [key, state] of Object.entries(legacy.gateways)) {
      const row = rows.find((item) => item.key === key)
      if (!row) continue

      const patch: PluginRowPatch = {}
      const hasConfig = Object.keys(storedConfig(row)).length > 0
      if (!hasConfig && Object.keys(state.config).length > 0) {
        // 旧数据是明文，导入时一并加密 secret 字段
        patch.config = JSON.stringify(serializeConfig(definitionOf(row), state.config))
      }
      if (typeof state.enabled === 'boolean') {
        patch.status = state.enabled ? 'installed' : 'disabled'
      }
      await updatePluginRow(row.key, patch)
    }
  }

  const defaultKey = legacy.default
    ? (matchRow(rows, legacy.default)?.key ?? DEFAULT_GATEWAY_KEY)
    : DEFAULT_GATEWAY_KEY

  // 迁移过的站点（只剩 default）不重复写，避免每次读取都写库
  if (legacy.hasLegacy || !storedDefault || defaultKey !== storedDefault) {
    await writePaymentSettings({ default: defaultKey })
  }
}

/** 默认渠道：存的是插件 key；失效时回落到第一个已启用插件 */
async function resolveDefaultKey(rows: PluginRow[]): Promise<string> {
  const stored = paymentDefaultFrom(await readPaymentSettings())
  const matched = stored ? matchRow(rows, stored)?.key : undefined
  const fallback =
    rows.find((row) => row.status === 'installed')?.key ?? rows[0]?.key ?? DEFAULT_GATEWAY_KEY

  const key = matched ?? fallback
  if (key !== stored) await writePaymentSettings({ default: key })
  return key
}

/* --------------------------------- 列表 ---------------------------------- */

/** 管理端列表：插件声明 + 当前脱敏配置 */
export async function listGateways(): Promise<GatewayList> {
  await ensurePaymentPlugins()
  const rows = await listPluginRows('payment')
  return {
    default: await resolveDefaultKey(rows),
    gateways: rows.map(toView)
  }
}

export async function getGateway(key: string): Promise<GatewayView> {
  await ensurePaymentPlugins()
  return toView(await requireRow(key))
}

/* --------------------------------- 保存 ---------------------------------- */

/**
 * 合并管理端提交的 config：
 * secret 字段收到空串或 MASK 时保留原值，避免前端回显后误清空；
 * 非 secret 字段允许用空串清空。未声明的字段一律忽略。
 */
function mergeConfig(
  definition: GatewayDefinition,
  current: Record<string, string>,
  patch: Record<string, unknown> | undefined
): Record<string, string> {
  const next = { ...current }
  if (!patch) return next

  for (const field of definition.fields) {
    if (!(field.key in patch)) continue
    const value = asString(patch[field.key])
    if (value === MASK) continue
    if (field.secret && value.trim() === '') continue
    next[field.key] = value
  }

  return next
}

async function saveGatewayRow(key: string, patch: GatewayPatch | undefined): Promise<PluginRow> {
  const row = await requireRow(key)
  const definition = definitionOf(row)
  const config = mergeConfig(definition, storedConfig(row), patch?.config)

  const next: PluginRowPatch = { config: JSON.stringify(serializeConfig(definition, config)) }
  if (typeof patch?.enabled === 'boolean') {
    next.status = patch.enabled ? 'installed' : 'disabled'
  }

  await updatePluginRow(row.key, next)
  return row
}

/**
 * 保存单个渠道的 enabled / config。
 * enabled 映射到 plugins.status：installed = 启用，disabled = 停用。
 */
export async function saveGateway(
  actor: AuditContext,
  key: string,
  patch: GatewayPatch
): Promise<GatewayList> {
  await ensurePaymentPlugins()
  const row = await saveGatewayRow(key, patch)

  await writeAudit(actor, {
    action: 'payment.gateway.update',
    targetType: 'payment_gateway',
    targetId: row.key,
    message: `更新支付渠道配置：${row.name}`,
    meta: { enabled: typeof patch.enabled === 'boolean' ? patch.enabled : undefined }
  })

  return listGateways()
}

/** 设置默认渠道（默认渠道与启用状态无关：停用不影响已选默认值） */
export async function setDefaultGateway(
  actor: AuditContext,
  key: string
): Promise<GatewayList> {
  await ensurePaymentPlugins()
  const row = await requireRow(key)

  await writePaymentSettings({ default: row.key })
  await writeAudit(actor, {
    action: 'payment.default.update',
    targetType: 'payment',
    targetId: row.key,
    message: `设置默认支付渠道：${row.name}`
  })

  return listGateways()
}

/* -------------------------------- 测试连接 -------------------------------- */

async function probeGateway(apiUrl: string): Promise<GatewayTestCheck> {
  const url = apiUrl.replace(/\/$/, '')
  const attempt = async (method: 'HEAD' | 'GET') => {
    return fetch(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
  }

  try {
    let response = await attempt('HEAD')
    // 部分易支付站点不支持 HEAD，退化为 GET 再试一次
    if (response.status === 405 || response.status === 501) response = await attempt('GET')

    return { name: '网关连通性', ok: response.ok, detail: `HTTP ${response.status}` }
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
 * 测试渠道配置：先校验必填项，配了网关地址的再探测连通性。
 * 连通性失败不算致命（不同网关对 HEAD/鉴权要求不同），只记录 detail。
 */
export async function testGateway(key: string): Promise<GatewayTestResult> {
  await ensurePaymentPlugins()
  const row = await requireRow(key)
  const definition = definitionOf(row)
  // secret 字段在库里是密文，校验/探测需要明文
  const config = plainConfig(definition, storedConfig(row))

  const checks: GatewayTestCheck[] = definition.fields
    .filter((field) => field.required)
    .map((field) => {
      const filled = (config[field.key] ?? '').trim() !== ''
      return {
        name: field.label,
        ok: filled,
        detail: filled ? '已填写' : '未填写'
      }
    })

  const apiUrl = (config.apiUrl ?? '').trim()
  if (apiUrl !== '') checks.push(await probeGateway(apiUrl))

  const ok = definition.fields.every(
    (field) => !field.required || (config[field.key] ?? '').trim() !== ''
  )
  return { ok, checks }
}

/* ------------------------------ 下单 / 设置兼容 ------------------------------ */

/**
 * 下单时判定是否走已配置渠道：
 * 默认渠道必须已启用、已实现，且必填项齐全；否则返回 null 走演示网关。
 * 返回值是短名（epay），与 orders.payment_method 的历史数据保持一致。
 */
export async function resolveCheckoutGateway(): Promise<string | null> {
  await ensurePaymentPlugins()
  const rows = await listPluginRows('payment')
  const defaultKey = await resolveDefaultKey(rows)
  const row = rows.find((item) => item.key === defaultKey)
  if (!row) return null
  if (row.status !== 'installed') return null
  if (!IMPLEMENTED_GATEWAYS.has(row.key)) return null

  const definition = definitionOf(row)
  const config = plainConfig(definition, storedConfig(row))
  const complete = definition.fields.every(
    (field) => !field.required || (config[field.key] ?? '').trim() !== ''
  )
  if (!complete) return null

  return pluginShortId(row.key)
}

/** 旧设置页的两个开关：状态直接来自 plugins.status */
const LEGACY_FLAGS: Record<string, keyof LegacyPaymentView> = {
  epay: 'epayEnabled',
  stripe: 'stripeEnabled'
}

export async function getLegacyPaymentView(): Promise<LegacyPaymentView> {
  await ensurePaymentPlugins()
  const rows = await listPluginRows('payment')
  const view: LegacyPaymentView = { epayEnabled: false, stripeEnabled: false }

  for (const [short, flag] of Object.entries(LEGACY_FLAGS)) {
    const row = rows.find((item) => pluginShortId(item.key) === short)
    view[flag] = row ? row.status === 'installed' : false
  }

  return view
}

/**
 * 旧设置接口（settings.payment）的支付片段 → 插件表。
 * 页面还没改之前，epayEnabled / stripeEnabled 与 gateways.<key> 都要能继续保存。
 */
export async function applyPaymentSettingsPatch(
  patch: LegacyPaymentPatch | undefined
): Promise<LegacyPaymentView> {
  await ensurePaymentPlugins()
  if (!patch) return getLegacyPaymentView()

  const rows = await listPluginRows('payment')
  for (const row of rows) {
    const short = pluginShortId(row.key)
    const entry = patch.gateways?.[row.key] ?? patch.gateways?.[short]
    const legacyFlag = LEGACY_FLAGS[short]
    const enabled = entry?.enabled ?? (legacyFlag ? patch[legacyFlag] : undefined)

    if (entry?.config || enabled !== undefined) {
      await saveGatewayRow(row.key, { enabled, config: entry?.config })
    }
  }

  if (patch.default) {
    const row = matchRow(rows, patch.default)
    if (row) await writePaymentSettings({ default: row.key })
  }

  return getLegacyPaymentView()
}
