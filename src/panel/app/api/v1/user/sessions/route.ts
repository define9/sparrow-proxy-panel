import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { listSessions } from '@/lib/services/profile'

export const GET = route(async () => {
  const session = await requireApiSession()
  return ok(await listSessions(session.user.id, session.sessionId))
})
