import 'server-only'
import type { z } from 'zod'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import type { AuditContext } from '@/lib/api/audit'
import { writeAudit } from '@/lib/api/audit'
import { parseJson } from '@/lib/api/admin-ops'
import type { settingsSchema } from '@/lib/api/schemas'

/**
 * 系统设置服务层：按 key 读写 settings 表，缺省值兜底。
 * 邮件密码只回显「是否已设置」，不把明文送回浏览器。
 */

export type SettingsPatch = Partial<z.infer<typeof settingsSchema>>

const KEYS = ['site', 'register', 'payment', 'mail'] as const
type SettingsKey = (typeof KEYS)[number]

const DEFAULTS = {
  site: { name: 'Sparrow Panel', logo: '', announcement: '', icp: '' },
  register: { open: true, emailVerify: false, giftTrafficGb: 0, inviteRequired: false },
  payment: { epayEnabled: true, stripeEnabled: false },
  mail: { host: '', port: 465, username: '', password: '' }
}

type SectionValues = typeof DEFAULTS
type StoredSections = { [K in SettingsKey]: SectionValues[K] }

export interface SettingsView {
  site: SectionValues['site']
  register: SectionValues['register']
  payment: SectionValues['payment']
  mail: {
    host: string
    port: number
    username: string
    password: string
    hasPassword: boolean
  }
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
    payment: {
      ...DEFAULTS.payment,
      ...(parseJson<Partial<SectionValues['payment']>>(stored.get('payment')) ?? {})
    },
    mail: {
      ...DEFAULTS.mail,
      ...(parseJson<Partial<SectionValues['mail']>>(stored.get('mail')) ?? {})
    }
  }
}

function toSettingsView(sections: StoredSections): SettingsView {
  return {
    site: sections.site,
    register: sections.register,
    payment: sections.payment,
    mail: {
      host: sections.mail.host,
      port: sections.mail.port,
      username: sections.mail.username,
      password: '',
      hasPassword: Boolean(sections.mail.password)
    }
  }
}

export async function getSettings(): Promise<SettingsView> {
  return toSettingsView(await readSections())
}

export async function updateSettings(
  actor: AuditContext,
  patch: SettingsPatch
): Promise<SettingsView> {
  const current = await readSections()
  const next: StoredSections = {
    site: { ...current.site, ...(patch.site ?? {}) },
    register: { ...current.register, ...(patch.register ?? {}) },
    payment: { ...current.payment, ...(patch.payment ?? {}) },
    mail: { ...current.mail, ...(patch.mail ?? {}) }
  }

  // 空密码表示保持原值（前端不回显明文，避免误清空）
  if (!patch.mail?.password) {
    next.mail.password = current.mail.password
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
