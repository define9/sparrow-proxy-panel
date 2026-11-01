import type {
  MailConfig,
  MailProviderKind,
  MailResendConfig,
  MailSmtpConfig
} from './types'

/**
 * settings.mail 的归一化与脱敏（纯函数，无数据访问）。
 *
 * 新结构：
 *   { provider, resend: { apiKey, from }, smtp: { host, port, username, password, from }, testTo }
 * 旧结构（扁平 host / port / username / password）读取时自动映射到 smtp。
 */

export const MASK = '••••'

const DEFAULT_PORT = 465

export interface LegacyMailConfig {
  host?: unknown
  port?: unknown
  username?: unknown
  password?: unknown
  from?: unknown
  apiKey?: unknown
}

export type StoredMailConfig = Partial<MailConfig> & LegacyMailConfig

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asPort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(port) && port > 0 && port <= 65535 ? Math.trunc(port) : DEFAULT_PORT
}

function asProvider(value: unknown): MailProviderKind {
  return value === 'log' ? 'log' : 'resend'
}

/** 新字段优先，旧扁平字段兜底 */
export function normalizeMailConfig(raw: StoredMailConfig | null | undefined): MailConfig {
  const value = raw ?? {}
  const resend = (value.resend ?? {}) as Partial<MailResendConfig>
  const smtp = (value.smtp ?? {}) as Partial<MailSmtpConfig>

  return {
    provider: asProvider(value.provider),
    resend: {
      apiKey: asString(resend.apiKey) || asString(value.apiKey),
      from: asString(resend.from) || asString(value.from)
    },
    smtp: {
      host: asString(smtp.host) || asString(value.host),
      port: asPort(smtp.port ?? value.port),
      username: asString(smtp.username) || asString(value.username),
      password: asString(smtp.password) || asString(value.password),
      from: asString(smtp.from) || asString(value.from)
    },
    testTo: asString(value.testTo)
  }
}

/**
 * 合并管理端提交的 patch。
 * 密钥字段为「空」或脱敏占位符 MASK 时保留原值，避免前端回显后误清空。
 */
export function mergeMailConfig(
  current: MailConfig,
  patch: StoredMailConfig | null | undefined
): MailConfig {
  const value = patch ?? {}
  const resendPatch = (value.resend ?? {}) as Partial<MailResendConfig>
  const smtpPatch = (value.smtp ?? {}) as Partial<MailSmtpConfig>

  const next: MailConfig = {
    provider: value.provider ? asProvider(value.provider) : current.provider,
    resend: { ...current.resend },
    smtp: { ...current.smtp },
    testTo: current.testTo
  }

  const apiKey = resendPatch.apiKey ?? asString(value.apiKey)
  if (isSecret(apiKey)) next.resend.apiKey = apiKey

  const resendFrom = resendPatch.from ?? asString(value.from)
  if (resendFrom) next.resend.from = resendFrom

  const host = smtpPatch.host ?? asString(value.host)
  if (host) next.smtp.host = host

  const port = smtpPatch.port ?? value.port
  if (port !== undefined) next.smtp.port = asPort(port)

  const username = smtpPatch.username ?? asString(value.username)
  if (username) next.smtp.username = username

  const password = smtpPatch.password ?? asString(value.password)
  if (isSecret(password)) next.smtp.password = password

  if (smtpPatch.from) next.smtp.from = smtpPatch.from

  if (value.testTo !== undefined) next.testTo = asString(value.testTo)

  return next
}

function isSecret(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value !== MASK
}

export interface MailSettingsView extends MailConfig {
  resend: MailResendConfig & { hasApiKey: boolean }
  smtp: MailSmtpConfig & { hasPassword: boolean }
  /** 旧设置页兼容字段（等价于 smtp.*） */
  host: string
  port: number
  username: string
  password: string
  hasPassword: boolean
}

/** 返回给管理端：密钥脱敏，只暴露「是否已设置」 */
export function toMailSettingsView(config: MailConfig): MailSettingsView {
  const hasApiKey = Boolean(config.resend.apiKey)
  const hasPassword = Boolean(config.smtp.password)

  return {
    provider: config.provider,
    testTo: config.testTo,
    resend: {
      apiKey: hasApiKey ? MASK : '',
      from: config.resend.from,
      hasApiKey
    },
    smtp: {
      ...config.smtp,
      password: hasPassword ? MASK : '',
      hasPassword
    },
    host: config.smtp.host,
    port: config.smtp.port,
    username: config.smtp.username,
    password: '',
    hasPassword
  }
}
