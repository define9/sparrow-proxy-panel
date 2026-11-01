import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { coupons } from '@/lib/db/schema'
import { ApiError, noContent, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { couponPatchSchema } from '@/lib/api/admin-ops'

type Ctx = { params: Promise<{ id: string }> }

function toDto(row: typeof coupons.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    quota: row.quota,
    usedCount: row.usedCount,
    minAmount: row.minAmount,
    enabled: row.enabled,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  }
}

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:coupon:write')
  const { id } = await ctx.params
  const body = couponPatchSchema.parse(await req.json())

  const [current] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'COUPON_NOT_FOUND', '优惠券不存在')

  const patch: Partial<typeof coupons.$inferInsert> = {}
  if (body.code !== undefined) {
    const code = body.code.trim().toUpperCase()
    const [taken] = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(and(eq(coupons.code, code), ne(coupons.id, id)))
      .limit(1)
    if (taken) throw new ApiError(409, 'COUPON_CODE_TAKEN', '该优惠券码已存在')
    patch.code = code
  }
  if (body.type !== undefined) patch.type = body.type
  if (body.value !== undefined) patch.value = body.value.toFixed(2)
  if (body.quota !== undefined) patch.quota = body.quota
  if (body.minAmount !== undefined) patch.minAmount = body.minAmount.toFixed(2)
  if (body.enabled !== undefined) patch.enabled = body.enabled
  if (body.expiresAt !== undefined) {
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new ApiError(422, 'COUPON_EXPIRES_INVALID', '到期时间格式不正确')
    }
    patch.expiresAt = expiresAt
  }

  if (Object.keys(patch).length === 0) return ok(toDto(current))

  const [row] = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning()

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'coupon.update',
      targetType: 'coupon',
      targetId: id,
      message: `更新优惠券 ${row.code}`,
      meta: { changes: body }
    }
  )

  return ok(toDto(row))
})

export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:coupon:write')
  const { id } = await ctx.params

  const [row] = await db.delete(coupons).where(eq(coupons.id, id)).returning()
  if (!row) throw new ApiError(404, 'COUPON_NOT_FOUND', '优惠券不存在')

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'coupon.delete',
      targetType: 'coupon',
      targetId: id,
      message: `删除优惠券 ${row.code}`,
      level: 'warn',
      meta: { code: row.code }
    }
  )

  return noContent()
})
