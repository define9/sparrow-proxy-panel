import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { adminOrderCompleteSchema } from '@/lib/api/commerce-schemas'
import { completeAdminOrder } from '@/lib/services/admin-commerce'

type Ctx = { params: Promise<{ id: string }> }

/** 手动完成：pending → paid，并开通订阅（演示支付网关不参与） */
export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:order:write')
  const { id } = await ctx.params
  const body = adminOrderCompleteSchema.parse(await req.json().catch(() => ({})))

  const result = await completeAdminOrder(id, body)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'order.complete',
      targetType: 'order',
      targetId: id,
      message: `手动完成订单 ${result.order.order.orderNo}`,
      meta: {
        note: body.note ?? null,
        subscriptionId: result.subscriptionId,
        idempotent: result.idempotent
      }
    }
  )

  return ok(result)
})
