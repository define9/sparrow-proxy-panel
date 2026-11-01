import { clientIp, noContent, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { revokeToken } from '@/lib/services/profile'

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession()
  const { id } = await ctx.params

  await revokeToken(session.user.id, id, { email: session.user.email, ip: clientIp(req) })
  return noContent()
})
