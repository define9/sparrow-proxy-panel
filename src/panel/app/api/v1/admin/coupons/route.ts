import { created, list, route } from '@/lib/api/response'
import { recordAudit } from '@/lib/api/audit'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'
import { couponInputSchema } from '@/lib/api/schemas'
import { requireApiSession } from '@/lib/auth/guard'
import { createCoupon, listCoupons } from '@/lib/services/coupons'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:coupon:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const { data, total } = await listCoupons({ q: url.searchParams.get('q') ?? '', ...page })

  return list(data, pageMeta(total, page))
})

export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:coupon:write')
  const body = couponInputSchema.parse(await req.json())

  const coupon = await createCoupon(body)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'coupon.create',
      targetType: 'coupon',
      targetId: coupon.id,
      message: `创建优惠券 ${coupon.code}（${coupon.type === 'fixed' ? `减 ${coupon.value}` : `${coupon.value}%`}）`,
      meta: { code: coupon.code, quota: coupon.quota, minAmount: coupon.minAmount }
    }
  )

  return created(coupon)
})
