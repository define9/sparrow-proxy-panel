import 'server-only'
import type { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import type { AuditContext } from '@/lib/api/audit'
import { writeAudit } from '@/lib/api/audit'
import { parseJson } from '@/lib/api/admin-ops'
import type { settingsSchema } from '@/lib/api/schemas'
import {
  mergeMailConfig,
  normalizeMailConfig,
  toMailSettingsView,
  type MailSettingsView,
  type StoredMailConfig
} from '@/lib/notify/config'
import type { MailConfig } from '@/lib/notify/types'
import {
  mergePaymentSettings,
  normalizePaymentSettings,
  toLegacyPaymentView,
  type PaymentPatch
} from '@/lib/payments/config'
import type { PaymentSettings } from '@/lib/payments/types'

/**
 * 系统设置服务层：按 key 读写 settings 表，缺省值兜底。
 * 邮件密钥（Resend apiKey / SMTP 密码）只回显「是否已设置」，不把明文送回浏览器。
 * 支付渠道按 lib/payments 的声明式配置存取，本文件只负责落库与旧开关兼容视图。
 */

export type SettingsPatch = Partial<z.infer<typeof settingsSchema>>

const KEYS = ['site', 'register', 'payment', 'mail'] as const
type SettingsKey = (typeof KEYS)[number]

const DEFAULTS = {
  site: { name: 'Sparrow Panel', logo: '', announcement: '', icp: '' },
  register: { open: true, emailVerify: false, giftTrafficGb: 0, inviteRequired: false }
} as const

type SectionValues = {
  site: { name: string; logo: string; announcement: string; icp: string }
  register: { open: boolean; emailVerify: boolean; giftTrafficGb: number; inviteRequired: boolean }
  payment: PaymentSettings
  mail: MailConfig
}

/** 旧设置页仍然按两个开关展示，视图层保持兼容 */
type PaymentView = { epayEnabled: boolean; stripeEnabled: boolean }

type StoredSections = { [K in SettingsKey]: SectionValues[K] }

export interface SettingsView {
  site: SectionValues['site']
  register: SectionValues['register']
  payment: PaymentView
  mail: MailSettingsView
}

async function readSections(): Promise<StoredSections> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, [...KEYS]))
  const stored = new Map(rows.map((row) => [row.key, row.value]))

  return {
    site: {
      ...DEFAULTS.site,
      ...(parseJson<Partial<SectionValues['site']>>(stored.get('site')) ?? {})
    },
    register: {
      ...DEFAULTS.register,
      ...(parseJson<Partial<SectionValues['register']>>(stored.get('register')) ?? {})
    },
    // 旧结构 { epayEnabled, stripeEnabled } 与缺省渠道都在 normalize 里补齐
    payment: normalizePaymentSettings(parseJson<unknown>(stored.get('payment'))),
    // 旧扁平结构（host/port/username/password）在 normalize 里映射到 smtp
    mail: normalizeMailConfig(parseJson<StoredMailConfig>(stored.get('mail')))
  }
}

function toSettingsView(sections: StoredSections): SettingsView {
  return {
    site: sections.site,
    register: sections.register,
    payment: toLegacyPaymentView(sections.payment),
    mail: toMailSettingsView(sections.mail)
  }
}

export async function getSettings(): Promise<SettingsView> {
  return toSettingsView(await readSections())
}

/**
 * 服务端内部读取邮件原始配置（含明文密钥）。
 * 仅供 lib/notify 解析 provider 使用，绝不能直接返回给 HTTP 响应。
 */
export async function getMailConfig(): Promise<MailConfig> {
  const rows = await db.select().from(settings).where(eq(settings.key, 'mail')).limit(1)
  return normalizeMailConfig(parseJson<StoredMailConfig>(rows[0]?.value))
}

/**
 * 服务端内部读取支付渠道配置（含明文密钥）。
 * 仅供 lib/payments 做校验、测试与下单判定，返回给 HTTP 前必须脱敏。
 */
export async function readPaymentSettings(): Promise<PaymentSettings> {
  const rows = await db.select().from(settings).where(eq(settings.key, 'payment')).limit(1)
  return normalizePaymentSettings(parseJson<unknown>(rows[0]?.value))
}

/** 支付渠道配置落库（审计由调用方 lib/payments 负责） */
export async function writePaymentSettings(value: PaymentSettings): Promise<void> {
  const serialized = JSON.stringify(value)
  await db
    .insert(settings)
    .values({ key: 'payment', value: serialized, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: serialized, updatedAt: new Date() }
    })
}

export async function updateSettings(
  actor: AuditContext,
  patch: SettingsPatch
): Promise<SettingsView> {
  const current = await readSections()
  const next: StoredSections = {
    site: { ...current.site, ...(patch.site ?? {}) },
    register: { ...current.register, ...(patch.register ?? {}) },
    payment: mergePaymentSettings(current.payment, patch.payment as PaymentPatch | undefined),
    // 密钥为空 / 脱敏占位符时保留原值
    mail: mergeMailConfig(current.mail, patch.mail as StoredMailConfig | undefined)
  }

  const updatedKeys = KEYS.filter((key) => patch[key] !== undefined)

  for (const key of updatedKeys) {
    const value = JSON.stringify(next[key])
    await db
      .insert(settings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
  }

  await writeAudit(actor, {
    action: 'setting.update',
    targetType: 'settings',
    targetId: updatedKeys.join(','),
    message: `更新系统设置：${updatedKeys.join('、') || '无'}`
  })

  return toSettingsView(next)
}
