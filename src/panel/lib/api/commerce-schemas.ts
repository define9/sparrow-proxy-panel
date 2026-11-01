import { z } from 'zod'

/**
 * 管理端商品 / 订单 / 订阅的请求体校验。
 * 与用户端契约（lib/api/schemas.ts）分开，避免管理端放宽的字段反向影响用户端。
 */

export const adminPlanPatchSchema = z.object({
  name: z.string().trim().min(2, '请填写商品名称').max(128).optional(),
  slug: z
    .string()
    .trim()
    .min(2, '请填写 slug')
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只能包含小写字母、数字与连字符')
    .optional(),
  description: z.string().max(20_000).optional(),
  type: z.enum(['traffic', 'time', 'bandwidth']).optional(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, '价格格式不正确')
    .optional(),
  originalPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, '划线价格式不正确')
    .nullable()
    .optional(),
  trafficGb: z.coerce.number().int().nonnegative().optional(),
  durationDays: z.coerce.number().int().positive().optional(),
  deviceLimit: z.coerce.number().int().nonnegative().optional(),
  speedLimitMbps: z.coerce.number().int().nonnegative().optional(),
  stock: z.coerce.number().int().nonnegative().nullable().optional(),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  isHot: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1)).max(20).optional(),
  sort: z.coerce.number().int().optional()
})

export const adminOrderQuerySchema = z.object({
  status: z.enum(['pending', 'paid', 'cancelled', 'expired', 'refunded']).optional(),
  q: z.string().trim().max(128).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
})

export const adminOrderCompleteSchema = z
  .object({
    /** 手动完成时的备注，写入支付记录 raw 与审计日志 */
    note: z.string().trim().max(200).optional(),
    tradeNo: z.string().trim().max(64).optional()
  })
  .default({})

export const adminOrderRefundSchema = z
  .object({
    reason: z.string().trim().max(200).optional()
  })
  .default({})

export const adminSubscriptionQuerySchema = z.object({
  q: z.string().trim().max(128).optional(),
  status: z.enum(['active', 'paused', 'expired', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
})

export const adminSubscriptionPatchSchema = z.object({
  /** 字节，0 = 不限 */
  trafficLimit: z.coerce.number().int().nonnegative().optional(),
  deviceLimit: z.coerce.number().int().min(0).max(9999).optional(),
  speedLimitMbps: z.coerce.number().int().nonnegative().optional(),
  expireAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['active', 'paused', 'expired', 'cancelled']).optional()
})

export const adminSubscriptionBatchSchema = z.object({
  ids: z.array(z.string().uuid('订阅 ID 不合法')).min(1, '请至少选择一个订阅').max(500),
  action: z.enum(['extend', 'quota', 'speed']),
  /** extend = 天数；quota = GB；speed = Mbps */
  value: z.coerce.number().int().nonnegative('数值不能为负数')
})

export type AdminPlanPatch = z.infer<typeof adminPlanPatchSchema>
export type AdminSubscriptionPatch = z.infer<typeof adminSubscriptionPatchSchema>
export type AdminSubscriptionBatch = z.infer<typeof adminSubscriptionBatchSchema>
