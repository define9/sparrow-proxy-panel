import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { adminOrderRefundSchema } from '@/lib/api/commerce-schemas'
import { refundAdminOrder } from '@/lib/services/admin-commerce'

type Ctx = { params: Promise<{ id: string }> }

/** 退款：paid → refunded，支付记录写 refunded，关联订阅置 cancelled */
export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:order:refund')
  const { id } = await ctx.params
  const body = adminOrderRefundSchema.parse(await req.json().catch(() => ({})))

  const result = await refundAdminOrder(id, body)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'order.refund',
      targetType: 'order',
      targetId: id,
      level: 'warn',
      message: `订单 ${result.order.order.orderNo} 已退款`,
      meta: {
        reason: body.reason ?? null,
        amount: result.order.order.amount,
        cancelledSubscriptions: result.cancelledSubscriptions
      }
    }
  )

  return ok(result)
})
