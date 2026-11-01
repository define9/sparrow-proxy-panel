import {
  defaultGatewayKey,
  gatewayDefaultEnabled,
  getGatewayDefinition,
  listGatewayDefinitions
} from './registry'
import type {
  GatewayConfig,
  GatewayDefinition,
  GatewayView,
  PaymentSettings
} from './types'

/**
 * settings.payment 的归一化、合并与脱敏（纯函数，无数据访问）。
 *
 * 新结构：
 *   { default, gateways: { <key>: { enabled, config: { <field>: string } } } }
 * 旧结构 { epayEnabled, stripeEnabled } 读取时自动映射成 gateways.<key>.enabled。
 */

/** secret 字段的回显占位符；提交同一占位符表示「保留原值」 */
export const MASK = '••••'

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function legacyEnabled(raw: Record<string, unknown>, key: string): boolean | undefined {
  switch (key) {
    case 'epay':
      return typeof raw.epayEnabled === 'boolean' ? raw.epayEnabled : undefined
    case 'stripe':
      return typeof raw.stripeEnabled === 'boolean' ? raw.stripeEnabled : undefined
    default:
      return undefined
  }
}

function normalizeConfig(
  definition: GatewayDefinition,
  rawConfig: unknown
): Record<string, string> {
  const value = asObject(rawConfig)
  const config: Record<string, string> = {}
  for (const field of definition.fields) config[field.key] = asString(value[field.key])
  return config
}

/** 任意来源（DB / 旧设置接口）→ 完整的新结构，缺失渠道补默认值 */
export function normalizePaymentSettings(raw: unknown): PaymentSettings {
  const value = asObject(raw)
  const rawGateways = asObject(value.gateways)
  const gateways: Record<string, GatewayConfig> = {}

  for (const definition of listGatewayDefinitions()) {
    const entry = asObject(rawGateways[definition.key])
    const legacy = legacyEnabled(value, definition.key)
    gateways[definition.key] = {
      enabled:
        typeof entry.enabled === 'boolean'
          ? entry.enabled
          : legacy ?? gatewayDefaultEnabled(definition.key),
      config: normalizeConfig(definition, entry.config)
    }
  }

  const fallback = defaultGatewayKey()
  const defaultKey =
    typeof value.default === 'string' && gateways[value.default] ? value.default : fallback

  return { default: defaultKey, gateways }
}

export interface GatewayPatch {
  enabled?: boolean
  config?: Record<string, unknown>
}

/**
 * 合并管理端提交的 patch。
 * secret 字段收到空串或 MASK 时保留原值，避免前端回显后误清空；
 * 非 secret 字段允许用空串清空。未声明的字段一律忽略。
 */
export function mergeGatewayState(
  definition: GatewayDefinition,
  current: GatewayConfig,
  patch: GatewayPatch | null | undefined
): GatewayConfig {
  const next: GatewayConfig = {
    enabled: typeof patch?.enabled === 'boolean' ? patch.enabled : current.enabled,
    config: { ...current.config }
  }

  const configPatch = asObject(patch?.config)
  for (const field of definition.fields) {
    if (!(field.key in configPatch)) continue
    const value = asString(configPatch[field.key])
    if (value === MASK) continue
    if (field.secret && value.trim() === '') continue
    next.config[field.key] = value
  }

  return next
}

export interface PaymentPatch extends GatewayPatch {
  epayEnabled?: boolean
  stripeEnabled?: boolean
  default?: string
  gateways?: Record<string, GatewayPatch | undefined>
}

/** 设置接口（含旧开关字段）合并到新结构 */
export function mergePaymentSettings(
  current: PaymentSettings,
  patch: PaymentPatch | null | undefined
): PaymentSettings {
  if (!patch) return current

  const next: PaymentSettings = {
    default: current.default,
    gateways: { ...current.gateways }
  }

  const patches = asObject(patch.gateways) as Record<string, GatewayPatch>
  for (const definition of listGatewayDefinitions()) {
    const legacy = legacyEnabled(patch as Record<string, unknown>, definition.key)
    const entry = patches[definition.key]
    const enabledPatch =
      typeof entry?.enabled === 'boolean' ? entry.enabled : legacy

    next.gateways[definition.key] = mergeGatewayState(definition, current.gateways[definition.key], {
      enabled: enabledPatch,
      config: entry?.config
    })
  }

  if (typeof patch.default === 'string' && next.gateways[patch.default]) {
    next.default = patch.default
  }

  return next
}

/** 返回给管理端：secret 字段脱敏成 MASK，并标记「是否已设置」 */
export function toGatewayView(
  definition: GatewayDefinition,
  state: GatewayConfig
): GatewayView {
  const config: Record<string, string> = {}
  let hasSecret = false

  for (const field of definition.fields) {
    const value = state.config[field.key] ?? ''
    if (field.secret) {
      if (value) hasSecret = true
      config[field.key] = value ? MASK : ''
    } else {
      config[field.key] = value
    }
  }

  return { ...definition, enabled: state.enabled, config, hasSecret }
}

/** 必填项缺失的字段（label 便于直接展示） */
export function missingRequiredFields(
  definition: GatewayDefinition,
  state: GatewayConfig
): string[] {
  return definition.fields
    .filter((field) => field.required && (state.config[field.key] ?? '').trim() === '')
    .map((field) => field.label)
}

export function isGatewayComplete(
  definition: GatewayDefinition,
  state: GatewayConfig
): boolean {
  return missingRequiredFields(definition, state).length === 0
}

/** 旧设置页 DTO（epayEnabled / stripeEnabled）的兼容视图 */
export function toLegacyPaymentView(settings: PaymentSettings): {
  epayEnabled: boolean
  stripeEnabled: boolean
} {
  return {
    epayEnabled: settings.gateways.epay?.enabled ?? gatewayDefaultEnabled('epay'),
    stripeEnabled: settings.gateways.stripe?.enabled ?? gatewayDefaultEnabled('stripe')
  }
}

/** 校验配置里的 select 值是否在声明范围内（保存时忽略非法值） */
export function isKnownGateway(key: string): boolean {
  return Boolean(getGatewayDefinition(key))
}
