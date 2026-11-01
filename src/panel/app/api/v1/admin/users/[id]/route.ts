import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roles, sessions, users } from '@/lib/db/schema'
import { ApiError, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { numeric, userUpdateSchema } from '@/lib/api/admin-ops'

type Ctx = { params: Promise<{ id: string }> }

function toDto(row: typeof users.$inferSelect) {
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

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:user:write')
  const { id } = await ctx.params
  const body = userUpdateSchema.parse(await req.json())

  const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  if (body.username && body.username !== current.username) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = ${body.username.toLowerCase()}`, ne(users.id, id)))
      .limit(1)
    if (taken) throw new ApiError(409, 'USER_USERNAME_TAKEN', '该用户名已被占用')
  }

  if (body.roleCode && body.roleCode !== current.roleCode) {
    const [role] = await db
      .select({ code: roles.code })
      .from(roles)
      .where(eq(roles.code, body.roleCode))
      .limit(1)
    if (!role) throw new ApiError(422, 'USER_ROLE_NOT_FOUND', '角色不存在')
  }

  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() }
  if (body.username !== undefined) patch.username = body.username
  if (body.roleCode !== undefined) patch.roleCode = body.roleCode
  if (body.status !== undefined) patch.status = body.status
  if (body.remark !== undefined) patch.remark = body.remark

  const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning()

  // 封禁立即失效全部会话（不改动操作者自己的会话）
  if (body.status === 'disabled' && id !== session.user.id) {
    await db.delete(sessions).where(eq(sessions.userId, id))
  }

  const changes = Object.entries({
    username: body.username,
    roleCode: body.roleCode,
    status: body.status,
    remark: body.remark
  })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value === null ? 'null' : String(value)}`)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'user.update',
      targetType: 'user',
      targetId: id,
      message: `更新用户 ${current.email}：${changes.join(', ') || '无字段变更'}`,
      meta: { changes: body }
    }
  )

  return ok(toDto(updated))
})
