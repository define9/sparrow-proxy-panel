import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loginLogs, roles, sessions, users } from '@/lib/db/schema'
import type { Session } from '@/lib/auth/types'

export const SESSION_COOKIE = 'spx_session'
const SESSION_TTL_DAYS = 7

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
    secure: process.env.NODE_ENV === 'production',
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
