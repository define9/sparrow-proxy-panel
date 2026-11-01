import 'server-only'
import { z } from 'zod'

/** 管理端列表统一分页（page/pageSize，上限 100） */
export interface PageQuery {
  page: number
  pageSize: number
  offset: number
}

export function parsePage(url: URL, defaultSize = 20, maxSize = 100): PageQuery {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const rawSize = Number(url.searchParams.get('pageSize')) || defaultSize
  const pageSize = Math.min(maxSize, Math.max(1, rawSize))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function pageMeta(total: number, query: PageQuery) {
  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    hasMore: query.offset + query.pageSize < total
  }
}

/** 把数据库 numeric(string) 转成 number，避免前端再做一次转换 */
export function numeric(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0
  return typeof value === 'number' ? value : Number(value)
}

export function iso(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/** 用户状态：管理端筛选既接受数据库值也接受展示值 */
export const userStatusFilter = z
  .enum(['active', 'disabled', 'pending', 'verified', 'unverified', 'banned', 'all'])
  .default('all')

const USER_STATUS_MAP: Record<string, 'active' | 'disabled' | 'pending'> = {
  active: 'active',
  verified: 'active',
  disabled: 'disabled',
  banned: 'disabled',
  pending: 'pending',
  unverified: 'pending'
}

export function normalizeUserStatus(value: string): 'active' | 'disabled' | 'pending' | undefined {
  return USER_STATUS_MAP[value]
}

export const userUpdateSchema = z.object({
  username: z.string().trim().min(2, '用户名至少 2 位').max(32, '用户名最多 32 位').optional(),
  roleCode: z.string().trim().min(1).max(32).optional(),
  status: z.enum(['active', 'disabled', 'pending']).optional(),
  remark: z.string().max(500).nullable().optional()
})

export const balanceAdjustSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  reason: z.string().trim().min(1, '请填写调整原因').max(200)
})

/** 金额校验：允许正负，最多两位小数，且不为 0 */
export function parseAmount(raw: string | number) {
  const text = typeof raw === 'number' ? raw.toFixed(2) : raw.trim()
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value) || value === 0) return null
  return value
}

export const couponPatchSchema = z
  .object({
    code: z.string().trim().min(3, '请填写优惠码').max(32),
    type: z.enum(['fixed', 'percent']),
    value: z.coerce.number().positive('面值必须大于 0'),
    quota: z.coerce.number().int().nonnegative(),
    minAmount: z.coerce.number().nonnegative(),
    expiresAt: z.string().nullable()
  })
  .partial()
  .extend({ enabled: z.boolean().optional() })
