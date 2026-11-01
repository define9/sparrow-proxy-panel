import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { payOrder } from '@/lib/services/billing'

/** 内置演示网关：直接完成支付并开通订阅，幂等 */
export const POST = route<{ params: Promise<{ orderNo: string }> }>(async (_req, ctx) => {
  const session = await requireApiSession()
  const { orderNo } = await ctx.params
  return ok(await payOrder(session.user.id, orderNo))
})
