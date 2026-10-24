import type { Plan, UpsertPlan } from '@sparrow/contracts'
import { CurrencySchema, IdSchema, MoneySchema, PlanStatusSchema, PlanTypeSchema } from '@sparrow/contracts'
import { z } from 'zod'
import type { plans } from '../../drizzle/schema'

/**
 * 商品领域逻辑：行 ↔ 视图映射，以及管理端写入的行数据构造。
 *
 * 契约里的 `Plan` / `UpsertPlan` 是唯一真相，这里只做数据库行（snake_case、
 * numeric 字符串）到契约（camelCase、number）的转换。
 */

/** 商品行（drizzle 推断） */
export type PlanRow = typeof plans.$inferSelect

/** 商品视图：与契约 `Plan` 一致 */
export type PlanView = Plan

/**
 * 商品局部更新 schema（PATCH）。
 *
 * 契约里的 `UpsertPlanSchema` 是「全量」语义且带默认值，
 * 直接 `.partial()` 会把未提交字段重置为默认值，因此这里单独定义一份
 * 「无默认值」的可选字段集。字段规则与契约保持一致。
 */
export const UpdatePlanSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, 'slug 只能包含小写字母、数字与连字符').optional(),
  description: z.string().nullish(),
  type: PlanTypeSchema.optional(),
  price: MoneySchema.optional(),
  originalPrice: MoneySchema.nullish(),
  currency: CurrencySchema.optional(),
  trafficGb: z.number().int().nonnegative().optional(),
  durationDays: z.number().int().nonnegative().optional(),
  deviceLimit: z.number().int().nonnegative().optional(),
  speedLimitMbps: z.number().int().nonnegative().optional(),
  resetDay: z.number().int().min(1).max(28).nullish(),
  renewResetRatio: z.number().min(0).max(1).optional(),
  stock: z.number().int().nullish(),
  status: PlanStatusSchema.optional(),
  sort: z.number().int().optional(),
  isHot: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  nodeGroupIds: z.array(IdSchema).optional()
})

export type UpdatePlan = z.infer<typeof UpdatePlanSchema>

/** 上架 / 下架请求体 */
export const PlanStatusBodySchema = z.object({
  status: PlanStatusSchema
})

/** 数据库行 → 视图对象 */
export function toPlanView(row: PlanRow): PlanView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    type: row.type,
    price: row.price,
    originalPrice: row.originalPrice,
    currency: row.currency,
    trafficGb: row.trafficGb,
    durationDays: row.durationDays,
    deviceLimit: row.deviceLimit,
    speedLimitMbps: row.speedLimitMbps,
    resetDay: row.resetDay,
    renewResetRatio: Number(row.renewResetRatio),
    stock: row.stock,
    soldCount: row.soldCount,
    status: row.status,
    sort: row.sort,
    isHot: row.isHot,
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString()
  }
}

/** 契约 `UpsertPlan` → 数据库写入值 */
export function toPlanInsertValues(body: UpsertPlan): typeof plans.$inferInsert {
  return {
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
    type: body.type,
    price: body.price,
    originalPrice: body.originalPrice ?? null,
    currency: body.currency,
    trafficGb: body.trafficGb,
    durationDays: body.durationDays,
    deviceLimit: body.deviceLimit,
    speedLimitMbps: body.speedLimitMbps,
    resetDay: body.resetDay ?? null,
    renewResetRatio: body.renewResetRatio.toFixed(2),
    stock: body.stock ?? null,
    status: body.status,
    sort: body.sort,
    isHot: body.isHot,
    tags: body.tags
  }
}

/** 局部更新 → 数据库写入值（只包含显式提交的字段） */
export function toPlanUpdateValues(body: UpdatePlan): Partial<typeof plans.$inferInsert> {
  const values: Partial<typeof plans.$inferInsert> = {}

  if (body.name !== undefined) values.name = body.name
  if (body.slug !== undefined) values.slug = body.slug
  if (body.description !== undefined) values.description = body.description ?? null
  if (body.type !== undefined) values.type = body.type
  if (body.price !== undefined) values.price = body.price
  if (body.originalPrice !== undefined) values.originalPrice = body.originalPrice ?? null
  if (body.currency !== undefined) values.currency = body.currency
  if (body.trafficGb !== undefined) values.trafficGb = body.trafficGb
  if (body.durationDays !== undefined) values.durationDays = body.durationDays
  if (body.deviceLimit !== undefined) values.deviceLimit = body.deviceLimit
  if (body.speedLimitMbps !== undefined) values.speedLimitMbps = body.speedLimitMbps
  if (body.resetDay !== undefined) values.resetDay = body.resetDay ?? null
  if (body.renewResetRatio !== undefined) values.renewResetRatio = body.renewResetRatio.toFixed(2)
  if (body.stock !== undefined) values.stock = body.stock ?? null
  if (body.status !== undefined) values.status = body.status
  if (body.sort !== undefined) values.sort = body.sort
  if (body.isHot !== undefined) values.isHot = body.isHot
  if (body.tags !== undefined) values.tags = body.tags

  return values
}

/** 商品是否可购买（已上架） */
export function isPlanPurchasable(plan: { status?: string }): boolean {
  return plan.status === 'active'
}

/** 商品是否有库存（null / undefined = 不限） */
export function isPlanInStock(plan: { stock?: number | null }, quantity = 1): boolean {
  return plan.stock === null || plan.stock === undefined || plan.stock >= quantity
}
