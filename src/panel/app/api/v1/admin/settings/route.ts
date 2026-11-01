import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { settingsSchema } from '@/lib/api/schemas'
import { parseJson } from '@/lib/api/admin-ops'

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

async function readSections(): Promise<StoredSections> {
  const rows = await db.select().from(settings).where(inArray(settings.key, [...KEYS]))
  const stored = new Map(rows.map((row) => [row.key, row.value]))

  return {
    site: { ...DEFAULTS.site, ...(parseJson<Partial<SectionValues['site']>>(stored.get('site')) ?? {}) },
    register: {
      ...DEFAULTS.register,
      ...(parseJson<Partial<SectionValues['register']>>(stored.get('register')) ?? {})
    },
    payment: {
      ...DEFAULTS.payment,
      ...(parseJson<Partial<SectionValues['payment']>>(stored.get('payment')) ?? {})
    },
    mail: { ...DEFAULTS.mail, ...(parseJson<Partial<SectionValues['mail']>>(stored.get('mail')) ?? {}) }
  }
}

/** 邮件密码只回显「是否已设置」，不把明文送回浏览器 */
function toResponse(sections: StoredSections) {
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

export const GET = route(async () => {
  await requireApiSession('admin:settings:read')
  return ok(toResponse(await readSections()))
})

export const PUT = route(async (req: Request) => {
  const session = await requireApiSession('admin:settings:write')
  const body = settingsSchema.partial().parse(await req.json())

  const current = await readSections()
  const next: StoredSections = {
    site: { ...current.site, ...(body.site ?? {}) },
    register: { ...current.register, ...(body.register ?? {}) },
    payment: { ...current.payment, ...(body.payment ?? {}) },
    mail: { ...current.mail, ...(body.mail ?? {}) }
  }

  // 空密码表示保持原值（前端不回显明文，避免误清空）
  if (!body.mail?.password) {
    next.mail.password = current.mail.password
  }

  const updatedKeys = KEYS.filter((key) => body[key] !== undefined)

  for (const key of updatedKeys) {
    const value = JSON.stringify(next[key])
    await db
      .insert(settings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
  }

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'setting.update',
      targetType: 'settings',
      targetId: updatedKeys.join(','),
      message: `更新系统设置：${updatedKeys.join('、') || '无'}`
    }
  )

  return ok(toResponse(next))
})
