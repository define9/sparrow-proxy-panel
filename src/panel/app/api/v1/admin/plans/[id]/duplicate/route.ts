import { created, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { duplicateAdminPlan } from '@/lib/services/admin-commerce'

type Ctx = { params: Promise<{ id: string }> }

export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:plan:write')
  const { id } = await ctx.params

  const plan = await duplicateAdminPlan(id)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'plan.duplicate',
      targetType: 'plan',
      targetId: plan.id,
      message: `复制商品 ${id} 为「${plan.name}」`,
      meta: { sourceId: id, slug: plan.slug }
    }
  )

  return created(plan)
})
