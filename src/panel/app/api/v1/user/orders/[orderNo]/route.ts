import { ok, route } from '@/lib/api/response'
import { requireUserApi } from '@/lib/auth/guard'
import { getUserOrder } from '@/lib/services/billing'

export const GET = route<{ params: Promise<{ orderNo: string }> }>(async (req, ctx) => {
  const session = await requireUserApi(req, 'orders:read')
  const { orderNo } = await ctx.params
  return ok(await getUserOrder(session.user.id, session.user.email, orderNo))
})
