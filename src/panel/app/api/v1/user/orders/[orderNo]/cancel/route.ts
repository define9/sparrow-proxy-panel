import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { cancelOrder } from '@/lib/services/billing'

export const POST = route<{ params: Promise<{ orderNo: string }> }>(async (_req, ctx) => {
  const session = await requireApiSession()
  const { orderNo } = await ctx.params
  return ok(await cancelOrder(session.user.id, session.user.email, orderNo))
})
