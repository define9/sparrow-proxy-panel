import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sessions } from '@/lib/db/schema'
import { ApiError, noContent, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'

type Ctx = { params: Promise<{ id: string; sid: string }> }

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:user:write')
  const { id, sid } = await ctx.params

  const [row] = await db
    .select({ id: sessions.id, ip: sessions.ip, userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, sid), eq(sessions.userId, id)))
    .limit(1)

  if (!row) throw new ApiError(404, 'SESSION_NOT_FOUND', '会话不存在或已失效')

  await db.delete(sessions).where(eq(sessions.id, sid))

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'user.session.revoke',
      targetType: 'session',
      targetId: sid,
      message: `强制下线用户 ${id} 的会话（IP ${row.ip ?? '未知'}）`,
      meta: { userId: id, sessionId: sid }
    }
  )

  return noContent()
})
