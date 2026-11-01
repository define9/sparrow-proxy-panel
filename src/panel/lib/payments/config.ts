import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { parseJson } from '@/lib/api/admin-ops'
import { builtinPluginsOfType } from '@/lib/plugin-host/builtin'
import type { BuiltinPlugin } from '@/lib/plugin-host/types'

/**
 * 默认渠道 + 旧 settings.payment 的一次性迁移。
 *
 * 迁移后 settings.payment 只剩 `{ default }`：渠道配置归 plugins.config，
 * 启用状态归 plugins.status，settings 里不再留第二份真相。
 */

/** 没有设置过 / 设置值失效时回落到易支付 */
export const DEFAULT_GATEWAY_KEY = 'payment-epay'

const PAYMENT_SETTINGS_KEY = 'payment'

/** payment-epay → epay：前端一直用短名，接口里额外返回的 id 就是它 */
export function pluginShortId(key: string): string {
  const prefix = 'payment-'
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}

/* --------------------------- settings.payment 读写 --------------------------- */

export async function readPaymentSettings(): Promise<unknown> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, PAYMENT_SETTINGS_KEY))
    .limit(1)
  return parseJson<unknown>(row?.value)
}

export async function writePaymentSettings(value: { default: string }): Promise<void> {
  const serialized = JSON.stringify({ default: value.default })
  await db
    .insert(settings)
    .values({ key: PAYMENT_SETTINGS_KEY, value: serialized, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: serialized, updatedAt: new Date() }
    })
}

/** settings.payment.default（可能是短名，也可能是插件 key） */
export function paymentDefaultFrom(raw: unknown): string {
  const value = asObject(raw)
  return typeof value.default === 'string' ? value.default.trim() : ''
}

/* ------------------------------- 旧结构迁移 ------------------------------- */

export interface LegacyGatewayState {
  config: Record<string, string>
  enabled?: boolean
}

export interface LegacyPaymentState {
  /** 旧结构里是否还残留渠道配置 / 启用开关（迁移完成后为 false） */
  hasLegacy: boolean
  /** 旧写法里的默认渠道：epay / payment-epay */
  default?: string
  /** key = 插件 key（payment-epay） */
  gateways: Record<string, LegacyGatewayState>
}

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

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function schemaFieldKeys(plugin: BuiltinPlugin): string[] {
  return Object.keys(plugin.manifest.configSchema.properties ?? {})
}

/**
 * 从旧结构里取出配置：
 * - 新一点的旧结构：{ config: { apiUrl, ... } }
 * - 更早的扁平结构：{ apiUrl, pid, key, ... } 直接铺在渠道对象上
 */
function legacyConfig(plugin: BuiltinPlugin, entry: Record<string, unknown>): Record<string, string> {
  const nested = asObject(entry.config)
  const bag = Object.keys(nested).length > 0 ? nested : entry
  const config: Record<string, string> = {}
  for (const key of schemaFieldKeys(plugin)) {
    const value = asString(bag[key])
    if (value !== '') config[key] = value
  }
  return config
}

/**
 * settings.payment 的旧结构：
 *   { epayEnabled, stripeEnabled }
 *   { default, gateways: { epay: { enabled, config } } }
 *   { epay: { apiUrl, pid, key } }（更早的扁平结构）
 * 兼容三种，缺失渠道不产生条目。
 */
export function extractLegacyPayment(raw: unknown): LegacyPaymentState {
  const value = asObject(raw)
  const rawGateways = asObject(value.gateways)
  const state: LegacyPaymentState = { hasLegacy: false, gateways: {} }

  for (const plugin of builtinPluginsOfType('payment')) {
    const short = pluginShortId(plugin.key)
    const entry = asObject(rawGateways[short] ?? rawGateways[plugin.key] ?? value[short])
    const config = legacyConfig(plugin, entry)
    const enabled = asBoolean(entry.enabled) ?? asBoolean(value[`${short}Enabled`])

    if (Object.keys(config).length > 0 || enabled !== undefined) state.hasLegacy = true
    state.gateways[plugin.key] = { config, enabled }
  }

  const defaultKey = paymentDefaultFrom(value)
  if (defaultKey) state.default = defaultKey

  return state
}
