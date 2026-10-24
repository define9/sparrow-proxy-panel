import { z } from 'zod'
import { BytesSchema, DateTimeSchema, IdSchema } from '../common'

export const SubscriptionStatusSchema = z.enum(['active', 'paused', 'expired', 'cancelled'])
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

export const SubscriptionFormatSchema = z.enum(['v2ray', 'clash', 'singbox'])
export type SubscriptionFormat = z.infer<typeof SubscriptionFormatSchema>

export const SubscriptionSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  planId: IdSchema,
  planName: z.string().nullish(),
  orderId: IdSchema.nullish(),
  token: z.uuid().meta({ description: '订阅凭据（URL 中使用）' }),
  format: SubscriptionFormatSchema,
  status: SubscriptionStatusSchema,
  deviceLimit: z.number().int().nonnegative(),
  speedLimitMbps: z.number().int().nonnegative(),
  trafficLimit: BytesSchema,
  trafficUsed: BytesSchema,
  upload: BytesSchema,
  download: BytesSchema,
  expireAt: DateTimeSchema.nullish(),
  resetAt: DateTimeSchema.nullish(),
  createdAt: DateTimeSchema
})
export type Subscription = z.infer<typeof SubscriptionSchema>

export const UpdateSubscriptionSchema = z.object({
  format: SubscriptionFormatSchema.optional(),
  deviceLimit: z.number().int().nonnegative().optional(),
  speedLimitMbps: z.number().int().nonnegative().optional(),
  trafficLimit: BytesSchema.optional(),
  expireAt: DateTimeSchema.nullish(),
  nodeGroupIds: z.array(IdSchema).optional()
})
export type UpdateSubscription = z.infer<typeof UpdateSubscriptionSchema>

/** 订阅配额判定结果（唯一真理：server/utils/quota.ts） */
export const QuotaStateSchema = z.object({
  allowed: z.boolean(),
  expired: z.boolean(),
  overused: z.boolean(),
  remainingBytes: BytesSchema,
  usedRatio: z.number().min(0).max(1)
})
export type QuotaState = z.infer<typeof QuotaStateSchema>
