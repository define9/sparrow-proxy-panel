import { z } from 'zod'

/** 资源 ID（UUID v4） */
export const IdSchema = z.uuid().meta({
  description: '资源 ID（UUID v4）',
  example: '9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d'
})

/** ISO 8601 时间戳（UTC） */
export const DateTimeSchema = z.iso.datetime({ offset: true }).meta({
  description: 'ISO 8601 时间戳（UTC）',
  example: '2026-10-24T08:00:00.000Z'
})

/** 金额：以字符串传递，避免浮点误差 */
export const MoneySchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, '金额格式非法').meta({
  description: '金额（字符串，两位小数）',
  example: '19.90'
})

/** 币种 */
export const CurrencySchema = z.string().length(3).meta({ example: 'CNY' })

/** 字节数 */
export const BytesSchema = z.number().int().nonnegative().meta({
  description: '字节数',
  example: 1073741824
})

/** 分页与排序查询参数 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().meta({ description: '页码（从 1 开始）' }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).meta({ description: '每页条数（上限 100）' }),
  cursor: z.string().optional().meta({ description: '游标（keyset 分页）' }),
  q: z.string().trim().min(1).optional().meta({ description: '搜索关键词' }),
  sort: z.string().optional().meta({ description: '排序字段' }),
  order: z.enum(['asc', 'desc']).optional().meta({ description: '排序方向' })
})

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>

/** 分页元信息 */
export const PaginationMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  hasMore: z.boolean(),
  nextCursor: z.string().nullish()
})

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>

/** 列表响应封装 */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    meta: PaginationMetaSchema
  })
}

/** 统一错误码（机器可读） */
export const ERROR_CODES = [
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_2FA_REQUIRED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_RATE_LIMITED',
  'PERM_DENIED',
  'PERM_SCOPE_MISSING',
  'USER_NOT_FOUND',
  'USER_DISABLED',
  'USER_EMAIL_TAKEN',
  'PLAN_NOT_FOUND',
  'PLAN_OUT_OF_STOCK',
  'PLAN_INACTIVE',
  'ORDER_NOT_FOUND',
  'ORDER_ALREADY_PAID',
  'ORDER_EXPIRED',
  'ORDER_STATUS_INVALID',
  'PAY_SIGN_INVALID',
  'PAY_GATEWAY_UNAVAILABLE',
  'PAY_AMOUNT_MISMATCH',
  'SUB_NOT_FOUND',
  'SUB_EXPIRED',
  'SUB_OVERUSED',
  'SUB_DEVICE_LIMIT',
  'NODE_NOT_FOUND',
  'NODE_DUPLICATED',
  'NODE_CERT_EXPIRED',
  'AGENT_SIGN_INVALID',
  'AGENT_TIMESTAMP_SKEW',
  'AGENT_VERSION_TOO_OLD',
  'AGENT_NONCE_REPLAY',
  'PLUGIN_NOT_INSTALLED',
  'PLUGIN_PERMISSION_DENIED',
  'PLUGIN_HOOK_FAILED',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'INTERNAL_ERROR'
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** 统一错误响应 */
export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().meta({ description: '机器可读错误码' }),
  message: z.string().meta({ description: '面向用户的提示（可被前端 i18n key 覆盖）' }),
  data: z.record(z.string(), z.unknown()).optional()
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
