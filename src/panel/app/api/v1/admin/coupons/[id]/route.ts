import { noContent, ok, route } from '@/lib/api/response'
import { recordAudit } from '@/lib/api/audit'
import { couponPatchSchema } from '@/lib/api/admin-ops'
import { requireApiSession } from '@/lib/auth/guard'
import { deleteCoupon, updateCoupon } from '@/lib/services/coupons'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:coupon:write')
  const { id } = await ctx.params
  const body = couponPatchSchema.parse(await req.json())

  const { coupon, changed } = await updateCoupon(id, body)
  if (!changed) return ok(coupon)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'coupon.update',
      targetType: 'coupon',
      targetId: id,
      message: `更新优惠券 ${coupon.code}`,
      meta: { changes: body }
    }
  )

  return ok(coupon)
})

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:coupon:write')
  const { id } = await ctx.params

  const coupon = await deleteCoupon(id)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'coupon.delete',
      targetType: 'coupon',
      targetId: id,
      message: `删除优惠券 ${coupon.code}`,
      level: 'warn',
      meta: { code: coupon.code }
    }
  )

  return noContent()
})
