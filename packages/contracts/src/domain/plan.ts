import { z } from 'zod'
import { CurrencySchema, DateTimeSchema, IdSchema, MoneySchema } from '../common'

export const PlanTypeSchema = z.enum(['traffic', 'time', 'bandwidth'])
export type PlanType = z.infer<typeof PlanTypeSchema>

export const PlanStatusSchema = z.enum(['draft', 'active', 'inactive'])
export type PlanStatus = z.infer<typeof PlanStatusSchema>

export const PlanSchema = z.object({
  id: IdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullish(),
  type: PlanTypeSchema,
  price: MoneySchema,
  originalPrice: MoneySchema.nullish(),
  currency: CurrencySchema,
  trafficGb: z.number().int().nonnegative().meta({ description: '总流量（GB），0 表示不限' }),
  durationDays: z.number().int().nonnegative(),
  deviceLimit: z.number().int().nonnegative(),
  speedLimitMbps: z.number().int().nonnegative().meta({ description: '0 表示不限速' }),
  resetDay: z.number().int().min(1).max(28).nullable(),
  renewResetRatio: z.number().min(0).max(1),
  stock: z.number().int().nullish().meta({ description: 'null 表示不限库存' }),
  soldCount: z.number().int().nonnegative(),
  status: PlanStatusSchema,
  sort: z.number().int(),
  isHot: z.boolean(),
  tags: z.array(z.string()),
  createdAt: DateTimeSchema
})
export type Plan = z.infer<typeof PlanSchema>

export const UpsertPlanSchema = z.object({
  name: z.string().trim().min(1).max(128),
  slug: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/, 'slug 只能包含小写字母、数字与连字符'),
  description: z.string().nullish(),
  type: PlanTypeSchema,
  price: MoneySchema,
  originalPrice: MoneySchema.nullish(),
  currency: CurrencySchema.default('CNY'),
  trafficGb: z.number().int().nonnegative().default(0),
  durationDays: z.number().int().nonnegative().default(30),
  deviceLimit: z.number().int().nonnegative().default(3),
  speedLimitMbps: z.number().int().nonnegative().default(0),
  resetDay: z.number().int().min(1).max(28).nullish(),
  renewResetRatio: z.number().min(0).max(1).default(1),
  stock: z.number().int().nullish(),
  status: PlanStatusSchema.default('draft'),
  sort: z.number().int().default(0),
  isHot: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  nodeGroupIds: z.array(IdSchema).default([])
})
export type UpsertPlan = z.infer<typeof UpsertPlanSchema>
