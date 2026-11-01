import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sessions, users } from '@/lib/db/schema'
import { ApiError, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'

type Ctx = { params: Promise<{ id: string }> }

export const GET = route<Ctx>(async (_req, ctx) => {
  const session = await requireApiSession('admin:user:read')
  const { id } = await ctx.params

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, id))
    .orderBy(desc(sessions.createdAt))

  return ok(
    rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      userAgent: row.userAgent,
      current: row.id === session.sessionId,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString()
    }))
  )
})
