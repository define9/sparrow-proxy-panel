import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { adminSubscriptionBatchSchema } from '@/lib/api/commerce-schemas'
import { batchAdminSubscriptions } from '@/lib/services/admin-commerce'

const ACTION_LABELS = { extend: '延长', quota: '调整配额', speed: '调整限速' } as const
const ACTION_UNITS = { extend: '天', quota: 'GB', speed: 'Mbps' } as const

/** 批量调整：body { ids, action: extend|quota|speed, value } */
export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:subscription:write')
  const body = adminSubscriptionBatchSchema.parse(await req.json())

  const result = await batchAdminSubscriptions(body)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'subscription.batch',
      targetType: 'subscription',
      targetId: null,
      message: `批量${ACTION_LABELS[body.action]} ${result.updated} 个订阅（${body.value} ${ACTION_UNITS[body.action]}）`,
      meta: {
        action: body.action,
        value: body.value,
        requested: body.ids.length,
        updated: result.updated,
        ids: body.ids
      }
    }
  )

  return ok(result)
})
