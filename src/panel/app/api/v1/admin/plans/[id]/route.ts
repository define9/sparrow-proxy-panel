import { noContent, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { adminPlanPatchSchema } from '@/lib/api/commerce-schemas'
import { deleteAdminPlan, updateAdminPlan } from '@/lib/services/admin-commerce'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:plan:write')
  const { id } = await ctx.params
  const body = adminPlanPatchSchema.parse(await req.json())

  const plan = await updateAdminPlan(id, body)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'plan.update',
      targetType: 'plan',
      targetId: id,
      message: `更新商品「${plan.name}」`,
      meta: { changes: body }
    }
  )

  return ok(plan)
})

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:plan:delete')
  const { id } = await ctx.params

  await deleteAdminPlan(id)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'plan.delete',
      targetType: 'plan',
      targetId: id,
      level: 'warn',
      message: `删除商品 ${id}`
    }
  )

  return noContent()
})
