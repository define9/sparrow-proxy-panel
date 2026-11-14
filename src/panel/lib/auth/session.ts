import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loginLogs, roles, sessions, users } from '@/lib/db/schema'
import type { Session } from '@/lib/auth/types'

export const SESSION_COOKIE = 'spx_session'
const SESSION_TTL_DAYS = 7

/**
 * 会话 cookie 是否带 Secure 属性。
 *
 * 默认：站点对外地址是 https → Secure；是 http → 不带。
 * 不能简单用 NODE_ENV === 'production'：纯 HTTP 部署（内网/无域名/IPv6 直连）
 * 时浏览器会拒收带 Secure 的 cookie，表现为「登录后立刻跳回登录页」，极难排查。
 *
 * 用 SITE_URL（不带 NEXT_PUBLIC_ 前缀 → 运行时读取，构建期内联拿不到真实值）。
 *
 * 显式覆盖：COOKIE_SECURE=1/true 强制开，=0/false 强制关。
 */
export function cookieSecure(): boolean {
  const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (explicit === '1' || explicit === 'true') return true
  if (explicit === '0' || explicit === 'false') return false
  const siteUrl = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim().toLowerCase()
  return siteUrl.startsWith('https://')
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    ip: meta.ip,
    userAgent: meta.userAgent,
    expiresAt
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    expires: expiresAt
  })

  return { token, expiresAt }
}

export async function destroySession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  }
  store.delete(SESSION_COOKIE)
}

/** 读 cookie → 查库 → 返回会话；无会话返回 null（不做重定向） */
export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      username: users.username,
      roleCode: users.roleCode,
      status: users.status,
      balance: users.balance,
      permissions: roles.permissions,
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(roles, eq(roles.code, users.roleCode))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)

  const row = rows[0]
  if (!row || row.status !== 'active') return null

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      email: row.email,
      username: row.username,
      role: row.roleCode,
      status: row.status,
      balance: row.balance
    },
    permissions: row.permissions ?? []
  }
}

export async function recordLogin(input: {
  userId?: string | null
  email: string
  ip?: string
  userAgent?: string
  success: boolean
  reason?: string
}) {
  await db.insert(loginLogs).values({
    userId: input.userId ?? null,
    email: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
    success: input.success,
    reason: input.reason
  })
}
