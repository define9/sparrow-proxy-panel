import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { adminSubscriptionPatchSchema } from '@/lib/api/commerce-schemas'
import { updateAdminSubscription } from '@/lib/services/admin-commerce'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:subscription:write')
  const { id } = await ctx.params
  const body = adminSubscriptionPatchSchema.parse(await req.json())

  const subscription = await updateAdminSubscription(id, body)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'subscription.update',
      targetType: 'subscription',
      targetId: id,
      message: `调整订阅 ${subscription.userEmail} / ${subscription.planName}`,
      meta: { changes: body }
    }
  )

  return ok(subscription)
})
