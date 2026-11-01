import { clientIp, noContent, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { revokeSession } from '@/lib/services/admin-users'

type Ctx = { params: Promise<{ id: string; sid: string }> }

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:user:write')
  const { id, sid } = await ctx.params

  const actor = { id: session.user.id, label: session.user.email, ip: clientIp(req) }
  await revokeSession(actor, id, sid)

  return noContent()
})
