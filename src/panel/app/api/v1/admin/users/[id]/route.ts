import { clientIp, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { userUpdateSchema } from '@/lib/api/admin-ops'
import { updateUser } from '@/lib/services/admin-users'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:user:write')
  const { id } = await ctx.params
  const body = userUpdateSchema.parse(await req.json())

  const actor = { id: session.user.id, label: session.user.email, ip: clientIp(req) }
  return ok(await updateUser(actor, id, body))
})
