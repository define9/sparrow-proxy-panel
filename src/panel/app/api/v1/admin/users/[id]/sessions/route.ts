import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { listSessions } from '@/lib/services/admin-users'

type Ctx = { params: Promise<{ id: string }> }

export const GET = route<Ctx>(async (_req, ctx) => {
  const session = await requireApiSession('admin:user:read')
  const { id } = await ctx.params

  return ok(await listSessions(id, session.sessionId))
})
