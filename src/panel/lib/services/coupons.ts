import 'server-only'
import { and, desc, eq, ilike, ne, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { ApiError } from '@/lib/api/response'
import type { couponPatchSchema } from '@/lib/api/admin-ops'
import type { couponInputSchema } from '@/lib/api/schemas'
import { db } from '@/lib/db'
import { coupons } from '@/lib/db/schema'

/**
 * 优惠券服务层。
 * route 只管 HTTP；券码唯一性、面值格式化、到期时间校验都在这里。
 */

export interface CouponDto {
  id: string
  code: string
  type: 'fixed' | 'percent'
  /** 金额/折扣值，两位小数字符串（与客户端契约一致） */
  value: string
  quota: number
  usedCount: number
  minAmount: string
  enabled: boolean
  expiresAt: string | null
  createdAt: string
}

type CouponRow = typeof coupons.$inferSelect

export type CouponInput = z.infer<typeof couponInputSchema>
export type CouponPatch = z.infer<typeof couponPatchSchema>

function toCouponDto(row: CouponRow): CouponDto {
  return {
    id: row.id,
    code: row.code,
    type: row.type as CouponDto['type'],
    value: row.value,
    quota: row.quota,
    usedCount: row.usedCount,
    minAmount: row.minAmount,
    enabled: row.enabled,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  }
}

export interface CouponListFilters {
  q?: string
  page: number
  pageSize: number
  offset: number
}

export interface CouponListResult {
  data: CouponDto[]
  total: number
}

export async function listCoupons(filters: CouponListFilters): Promise<CouponListResult> {
  const keyword = filters.q?.trim() ?? ''
  const where = keyword ? ilike(coupons.code, `%${keyword}%`) : undefined

  const rows = await db
    .select()
    .from(coupons)
    .where(where)
    .orderBy(desc(coupons.createdAt))
    .limit(filters.pageSize)
    .offset(filters.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(coupons).where(where)

  return { data: rows.map(toCouponDto), total: Number(countRow?.total ?? 0) }
}

/** 券码统一大写去空格；重复券码返回 409 */
async function assertCodeAvailable(code: string, exceptId?: string) {
  const where = exceptId
    ? and(eq(coupons.code, code), ne(coupons.id, exceptId))
    : eq(coupons.code, code)
  const [taken] = await db.select({ id: coupons.id }).from(coupons).where(where).limit(1)
  if (taken) throw new ApiError(409, 'COUPON_CODE_TAKEN', '该优惠券码已存在')
}

function parseExpiresAt(raw: string): Date | null {
  const expiresAt = new Date(raw)
  if (Number.isNaN(expiresAt.getTime())) {
    throw new ApiError(422, 'COUPON_EXPIRES_INVALID', '到期时间格式不正确')
  }
  return expiresAt
}

export async function createCoupon(input: CouponInput): Promise<CouponDto> {
  const code = input.code.trim().toUpperCase()
  await assertCodeAvailable(code)

  const expiresAt = input.expiresAt ? parseExpiresAt(input.expiresAt) : null

  const [row] = await db
    .insert(coupons)
    .values({
      code,
      type: input.type,
      value: input.value.toFixed(2),
      quota: input.quota,
      minAmount: input.minAmount.toFixed(2),
      expiresAt
    })
    .returning()

  return toCouponDto(row)
}

export interface UpdateCouponResult {
  coupon: CouponDto
  /** 没有任何字段变化时不写审计（与改造前行为一致） */
  changed: boolean
}

export async function updateCoupon(id: string, patchInput: CouponPatch): Promise<UpdateCouponResult> {
  const [current] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'COUPON_NOT_FOUND', '优惠券不存在')

  const patch: Partial<typeof coupons.$inferInsert> = {}
  if (patchInput.code !== undefined) {
    const code = patchInput.code.trim().toUpperCase()
    await assertCodeAvailable(code, id)
    patch.code = code
  }
  if (patchInput.type !== undefined) patch.type = patchInput.type
  if (patchInput.value !== undefined) patch.value = patchInput.value.toFixed(2)
  if (patchInput.quota !== undefined) patch.quota = patchInput.quota
  if (patchInput.minAmount !== undefined) patch.minAmount = patchInput.minAmount.toFixed(2)
  if (patchInput.enabled !== undefined) patch.enabled = patchInput.enabled
  if (patchInput.expiresAt !== undefined) {
    patch.expiresAt = patchInput.expiresAt ? parseExpiresAt(patchInput.expiresAt) : null
  }

  if (Object.keys(patch).length === 0) {
    return { coupon: toCouponDto(current), changed: false }
  }

  const [row] = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning()
  return { coupon: toCouponDto(row), changed: true }
}

/** 返回被删除的券，供 route 写审计用 */
export async function deleteCoupon(id: string): Promise<CouponDto> {
  const [row] = await db.delete(coupons).where(eq(coupons.id, id)).returning()
  if (!row) throw new ApiError(404, 'COUPON_NOT_FOUND', '优惠券不存在')
  return toCouponDto(row)
}
