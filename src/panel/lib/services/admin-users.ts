import 'server-only'
import type { z } from 'zod'
import { and, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roles, sessions, subscriptions, users } from '@/lib/db/schema'
import { ApiError } from '@/lib/api/response'
import type { AuditContext } from '@/lib/api/audit'
import { writeAudit } from '@/lib/api/audit'
import {
  balanceAdjustSchema,
  normalizeUserStatus,
  numeric,
  parseAmount,
  userUpdateSchema
} from '@/lib/api/admin-ops'

/**
 * 管理端用户域服务层：列表 / 详情 / 改资料 / 调余额 / 会话管理。
 * 审计统一走 lib/api/audit.ts，action 字符串与重构前保持一致。
 */

export type UserUpdateInput = z.infer<typeof userUpdateSchema>
export type BalanceAdjustInput = z.infer<typeof balanceAdjustSchema>

type UserRow = typeof users.$inferSelect

export interface UserListFilters {
  q?: string
  role?: string
  status?: string
  page: number
  pageSize: number
}

export interface AdminUserListItem {
  id: string
  email: string
  username: string
  roleCode: string
  roleName: string | null
  status: string
  balance: string
  trafficLimit: number
  trafficUsed: number
  remark: string | null
  twofaEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  subscriptionCount: number
}

export interface AdminUserDetail {
  id: string
  email: string
  username: string
  roleCode: string
  status: string
  balance: string
  remark: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminSessionItem {
  id: string
  ip: string | null
  userAgent: string | null
  current: boolean
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

function toUserDetail(row: UserRow): AdminUserDetail {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    roleCode: row.roleCode,
    status: row.status,
    balance: numeric(row.balance).toFixed(2),
    remark: row.remark,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

export async function listUsers(
  filters: UserListFilters
): Promise<{ items: AdminUserListItem[]; total: number }> {
  const keyword = filters.q?.trim() ?? ''
  const role = filters.role?.trim() ?? ''
  const status = filters.status?.trim() ?? ''
  const offset = (filters.page - 1) * filters.pageSize

  const conditions = []
  if (keyword) {
    conditions.push(or(ilike(users.email, `%${keyword}%`), ilike(users.username, `%${keyword}%`)))
  }
  if (role && role !== 'all') {
    conditions.push(eq(users.roleCode, role))
  }
  if (status && status !== 'all') {
    const normalized = normalizeUserStatus(status)
    if (normalized) conditions.push(eq(users.status, normalized))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      roleCode: users.roleCode,
      roleName: roles.name,
      status: users.status,
      balance: users.balance,
      trafficLimit: users.trafficLimit,
      trafficUsed: users.trafficUsed,
      remark: users.remark,
      twofaEnabled: users.twofaEnabled,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      subscriptionCount: sql<number>`(
        select count(*)::int from ${subscriptions}
        where ${subscriptions.userId} = ${users.id}
          and ${subscriptions.status} = 'active'
      )`
    })
    .from(users)
    .leftJoin(roles, eq(roles.code, users.roleCode))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(filters.pageSize)
    .offset(offset)

  const [countRow] = await db
    .select({ total: sql<string>`count(*)` })
    .from(users)
    .where(where)

  return {
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      username: row.username,
      roleCode: row.roleCode,
      roleName: row.roleName,
      status: row.status,
      balance: numeric(row.balance).toFixed(2),
      trafficLimit: numeric(row.trafficLimit),
      trafficUsed: numeric(row.trafficUsed),
      remark: row.remark,
      twofaEnabled: row.twofaEnabled,
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      subscriptionCount: Number(row.subscriptionCount ?? 0)
    })),
    total: Number(countRow?.total ?? 0)
  }
}

export async function getUser(id: string): Promise<AdminUserDetail> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')
  return toUserDetail(row)
}

export async function updateUser(
  actor: AuditContext,
  id: string,
  patch: UserUpdateInput
): Promise<AdminUserDetail> {
  const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  if (patch.username && patch.username !== current.username) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = ${patch.username.toLowerCase()}`, ne(users.id, id)))
      .limit(1)
    if (taken) throw new ApiError(409, 'USER_USERNAME_TAKEN', '该用户名已被占用')
  }

  if (patch.roleCode && patch.roleCode !== current.roleCode) {
    const [role] = await db
      .select({ code: roles.code })
      .from(roles)
      .where(eq(roles.code, patch.roleCode))
      .limit(1)
    if (!role) throw new ApiError(422, 'USER_ROLE_NOT_FOUND', '角色不存在')
  }

  const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
  if (patch.username !== undefined) values.username = patch.username
  if (patch.roleCode !== undefined) values.roleCode = patch.roleCode
  if (patch.status !== undefined) values.status = patch.status
  if (patch.remark !== undefined) values.remark = patch.remark

  const [updated] = await db.update(users).set(values).where(eq(users.id, id)).returning()

  // 封禁立即失效全部会话（不改动操作者自己的会话）
  if (patch.status === 'disabled' && id !== actor.id) {
    await db.delete(sessions).where(eq(sessions.userId, id))
  }

  const changes = Object.entries({
    username: patch.username,
    roleCode: patch.roleCode,
    status: patch.status,
    remark: patch.remark
  })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value === null ? 'null' : String(value)}`)

  await writeAudit(actor, {
    action: 'user.update',
    targetType: 'user',
    targetId: id,
    message: `更新用户 ${current.email}：${changes.join(', ') || '无字段变更'}`,
    meta: { changes: patch }
  })

  return toUserDetail(updated)
}

export async function adjustBalance(
  actor: AuditContext,
  id: string,
  input: BalanceAdjustInput
): Promise<{ id: string; balance: string }> {
  const amount = parseAmount(input.amount)
  if (amount === null) {
    throw new ApiError(422, 'USER_BALANCE_AMOUNT_INVALID', '调整金额需为非 0 数字，最多两位小数')
  }

  const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  const next = Math.round((numeric(current.balance) + amount) * 100) / 100
  if (next < 0) {
    throw new ApiError(422, 'USER_BALANCE_INSUFFICIENT', '调整后余额不能小于 0')
  }

  const [updated] = await db
    .update(users)
    .set({ balance: next.toFixed(2), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()

  const sign = amount > 0 ? '+' : ''
  await writeAudit(actor, {
    action: 'user.balance',
    targetType: 'user',
    targetId: id,
    message: `调整用户 ${current.email} 余额 ${sign}${amount.toFixed(2)}：${input.reason}`,
    meta: { before: current.balance, after: updated.balance, amount, reason: input.reason }
  })

  return { id, balance: numeric(updated.balance).toFixed(2) }
}

/** 会话列表；currentSessionId 用于标出「正在查看的这条会话」 */
export async function listSessions(id: string, currentSessionId?: string): Promise<AdminSessionItem[]> {
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, id))
    .orderBy(desc(sessions.createdAt))

  return rows.map((row) => ({
    id: row.id,
    ip: row.ip,
    userAgent: row.userAgent,
    current: row.id === currentSessionId,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString()
  }))
}

export async function revokeSession(actor: AuditContext, id: string, sid: string): Promise<void> {
  const [row] = await db
    .select({ id: sessions.id, ip: sessions.ip, userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, sid), eq(sessions.userId, id)))
    .limit(1)

  if (!row) throw new ApiError(404, 'SESSION_NOT_FOUND', '会话不存在或已失效')

  await db.delete(sessions).where(eq(sessions.id, sid))

  await writeAudit(actor, {
    action: 'user.session.revoke',
    targetType: 'session',
    targetId: sid,
    message: `强制下线用户 ${id} 的会话（IP ${row.ip ?? '未知'}）`,
    meta: { userId: id, sessionId: sid }
  })
}
