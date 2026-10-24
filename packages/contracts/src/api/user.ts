import { z } from 'zod'
import { BytesSchema, DateTimeSchema, IdSchema, MoneySchema, paginated, PaginationQuerySchema } from '../common'
import { OrderSchema } from '../domain/order'
import { PlanSchema } from '../domain/plan'
import { QuotaStateSchema, SubscriptionSchema } from '../domain/subscription'

/** 用户端概览 */
export const UserOverviewSchema = z.object({
  user: z.object({
    email: z.email(),
    username: z.string(),
    balance: MoneySchema,
    currency: z.string()
  }),
  quota: QuotaStateSchema,
  subscriptions: z.array(SubscriptionSchema).max(10),
  recentOrders: z.array(OrderSchema).max(5),
  announcements: z.array(z.object({
    id: IdSchema,
    title: z.string(),
    content: z.string(),
    publishedAt: DateTimeSchema
  })),
  nodeOnlineCount: z.number().int().nonnegative()
})
export type UserOverview = z.infer<typeof UserOverviewSchema>

/** 支付发起结果 */
export const PaymentIntentSchema = z.object({
  gateway: z.string(),
  payUrl: z.string().nullish(),
  qrcode: z.string().nullish(),
  orderNo: z.string(),
  amount: MoneySchema,
  expiresAt: DateTimeSchema.nullish()
})
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>

/** 流量统计 */
export const TrafficPointSchema = z.object({
  date: z.string().meta({ description: 'YYYY-MM-DD' }),
  upload: BytesSchema,
  download: BytesSchema,
  total: BytesSchema
})
export type TrafficPoint = z.infer<typeof TrafficPointSchema>

export const TrafficStatsSchema = z.object({
  points: z.array(TrafficPointSchema),
  total: BytesSchema,
  byNode: z.array(z.object({
    nodeId: IdSchema,
    nodeName: z.string(),
    total: BytesSchema
  }))
})
export type TrafficStats = z.infer<typeof TrafficStatsSchema>

/* ── 响应封装 ── */

export const PlanListResponseSchema = paginated(PlanSchema)
export const OrderListResponseSchema = paginated(OrderSchema)
export const SubscriptionListResponseSchema = paginated(SubscriptionSchema)

export const UserApiQuerySchema = PaginationQuerySchema

export const SubscribeInfoSchema = z.object({
  token: z.uuid(),
  format: z.enum(['v2ray', 'clash', 'singbox']),
  quota: QuotaStateSchema,
  expireAt: DateTimeSchema.nullish(),
  urls: z.record(z.string(), z.string()),
  updatedAt: DateTimeSchema
})
export type SubscribeInfo = z.infer<typeof SubscribeInfoSchema>
