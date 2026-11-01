import { desc, eq, ilike, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { coupons } from '@/lib/db/schema'
import { ApiError, created, list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/api/audit'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'
import { couponInputSchema } from '@/lib/api/schemas'

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

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:coupon:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const where = q ? ilike(coupons.code, `%${q}%`) : undefined

  const rows = await db
    .select()
    .from(coupons)
    .where(where)
    .orderBy(desc(coupons.createdAt))
    .limit(page.pageSize)
    .offset(page.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(coupons).where(where)
  const total = Number(countRow?.total ?? 0)

  return list(rows.map(toDto), pageMeta(total, page))
})

export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:coupon:write')
  const body = couponInputSchema.parse(await req.json())

  const code = body.code.trim().toUpperCase()
  const [taken] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1)
  if (taken) throw new ApiError(409, 'COUPON_CODE_TAKEN', '该优惠券码已存在')

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new ApiError(422, 'COUPON_EXPIRES_INVALID', '到期时间格式不正确')
  }

  const [row] = await db
    .insert(coupons)
    .values({
      code,
      type: body.type,
      value: body.value.toFixed(2),
      quota: body.quota,
      minAmount: body.minAmount.toFixed(2),
      expiresAt
    })
    .returning()

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'coupon.create',
      targetType: 'coupon',
      targetId: row.id,
      message: `创建优惠券 ${row.code}（${row.type === 'fixed' ? `减 ${row.value}` : `${row.value}%`}）`,
      meta: { code: row.code, quota: row.quota, minAmount: row.minAmount }
    }
  )

  return created(toDto(row))
})
