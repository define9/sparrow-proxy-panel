import 'server-only'
import { count, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLogs, roles, settings, users } from '@/lib/db/schema'
import { ApiError } from '@/lib/api/response'
import { hashPassword } from '@/lib/auth/password'
import { PERMISSIONS } from '@sparrow/contracts'

export interface SetupStatus {
  initialized: boolean
  siteName: string
  /** 需要 SETUP_TOKEN 才能初始化（远端访问时开启） */
  tokenRequired: boolean
}

const SETUP_KEY = 'setup'
const SITE_KEY = 'site'

export async function getSetupStatus(): Promise<SetupStatus> {
  const [flag] = await db.select().from(settings).where(eq(settings.key, SETUP_KEY)).limit(1)
  const [adminCount] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.roleCode, 'superadmin'))
  const [site] = await db.select().from(settings).where(eq(settings.key, SITE_KEY)).limit(1)

  let siteName = 'Sparrow Panel'
  if (site?.value) {
    try {
      siteName = JSON.parse(site.value).name ?? siteName
    } catch {
      // 旧数据非 JSON，忽略
    }
  }

  return {
    initialized: Boolean(flag) || Number(adminCount?.total ?? 0) > 0,
    siteName,
    tokenRequired: Boolean(process.env.SETUP_TOKEN)
  }
}

export interface SetupInput {
  siteName: string
  email: string
  username: string
  password: string
  token?: string
}

/** 初始化：建超管 + 写站点设置 + 打初始化标记（一次性，并发安全） */
export async function initializeSite(
  input: SetupInput,
  meta: { ip?: string }
): Promise<{ userId: string; email: string }> {
  if (process.env.SETUP_TOKEN && input.token !== process.env.SETUP_TOKEN) {
    throw new ApiError(403, 'SETUP_TOKEN_INVALID', '初始化令牌不正确')
  }

  return db.transaction(async (tx) => {
    // 用 settings 主键抢占：并发提交时只有一个能插入成功
    const claim = await tx
      .insert(settings)
      .values({ key: SETUP_KEY, value: JSON.stringify({ at: new Date().toISOString() }) })
      .onConflictDoNothing()
      .returning({ key: settings.key })

    if (claim.length === 0) {
      throw new ApiError(409, 'SETUP_ALREADY_DONE', '站点已完成初始化')
    }

    // 空库直接跑 setup 时 roles 表是空的，这里补齐三个内置角色
    await tx
      .insert(roles)
      .values([
        { code: 'user', name: '普通用户', isSystem: true, permissions: [] },
        {
          code: 'admin',
          name: '管理员',
          isSystem: true,
          permissions: PERMISSIONS.filter((p) => p !== 'admin:plugin:delete')
        },
        { code: 'superadmin', name: '超级管理员', isSystem: true, permissions: ['*'] }
      ])
      .onConflictDoNothing()

    const passwordHash = await hashPassword(input.password)
    const [admin] = await tx
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        username: input.username,
        passwordHash,
        roleCode: 'superadmin',
        status: 'active'
      })
      .returning({ id: users.id, email: users.email })

    const siteValue = JSON.stringify({
      name: input.siteName,
      logo: '',
      announcement: '',
      icp: ''
    })
    await tx
      .insert(settings)
      .values({ key: SITE_KEY, value: siteValue })
      .onConflictDoUpdate({ target: settings.key, set: { value: siteValue, updatedAt: new Date() } })

    await tx.insert(auditLogs).values({
      actorType: 'user',
      actorId: admin.id,
      actorLabel: admin.email,
      action: 'site.init',
      targetType: 'site',
      targetId: input.siteName,
      ip: meta.ip,
      message: `站点初始化：${input.siteName}`,
      level: 'info'
    })

    return { userId: admin.id, email: admin.email }
  })
}
