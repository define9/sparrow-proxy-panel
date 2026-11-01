import { clientIp, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { balanceAdjustSchema } from '@/lib/api/admin-ops'
import { adjustBalance } from '@/lib/services/admin-users'

type Ctx = { params: Promise<{ id: string }> }

export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:user:balance')
  const { id } = await ctx.params
  const body = balanceAdjustSchema.parse(await req.json())

  const actor = { id: session.user.id, label: session.user.email, ip: clientIp(req) }
  return ok(await adjustBalance(actor, id, body))
})
