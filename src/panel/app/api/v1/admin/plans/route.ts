import { ok, created, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { planInputSchema } from '@/lib/api/schemas'
import { createAdminPlan, listAdminPlans } from '@/lib/services/admin-commerce'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:plan:read')

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const rawStatus = url.searchParams.get('status')?.trim() ?? ''
  const status =
    rawStatus === 'draft' || rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : undefined

  return ok(await listAdminPlans({ q, status }))
})

export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:plan:write')
  const body = planInputSchema.parse(await req.json())

  const plan = await createAdminPlan({
    name: body.name.trim(),
    slug: body.slug.trim(),
    description: body.description,
    type: body.type,
    price: body.price,
    originalPrice: body.originalPrice,
    trafficGb: body.trafficGb,
    durationDays: body.durationDays,
    deviceLimit: body.deviceLimit,
    speedLimitMbps: body.speedLimitMbps,
    stock: body.stock,
    status: body.status,
    isHot: body.isHot,
    tags: body.tags,
    sort: body.sort
  })

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'plan.create',
      targetType: 'plan',
      targetId: plan.id,
      message: `创建商品「${plan.name}」（${plan.slug}）`,
      meta: { price: plan.price, status: plan.status, stock: plan.stock }
    }
  )

  return created(plan)
})
