import { z } from 'zod'
import { BytesSchema, DateTimeSchema, IdSchema, MoneySchema, paginated, PaginationQuerySchema } from '../common'
import { NodeSchema } from '../domain/node'
import { OrderSchema } from '../domain/order'
import { PlanSchema } from '../domain/plan'
import { PluginSchema, PluginSourceSchema } from '../domain/plugin'
import { SubscriptionSchema } from '../domain/subscription'
import { UserSchema } from '../domain/user'

export const AdminDashboardStatsSchema = z.object({
  userCount: z.number().int().nonnegative(),
  userCountToday: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  paidOrderCount: z.number().int().nonnegative(),
  revenueTotal: MoneySchema,
  revenueToday: MoneySchema,
  activeSubscriptions: z.number().int().nonnegative(),
  expiringSubscriptions: z.number().int().nonnegative(),
  onlineNodes: z.number().int().nonnegative(),
  totalNodes: z.number().int().nonnegative(),
  trafficTotal: BytesSchema,
  trafficToday: BytesSchema
})
export type AdminDashboardStats = z.infer<typeof AdminDashboardStatsSchema>

export const AdminUserFilterSchema = PaginationQuerySchema.extend({
  status: z.enum(['active', 'disabled', 'pending']).optional(),
  role: z.string().optional()
})

export const AdminAdjustBalanceSchema = z.object({
  amount: MoneySchema.meta({ description: '正数为加，负数为扣' }),
  reason: z.string().trim().min(1).max(200)
})

export const AdminManualSubscriptionSchema = z.object({
  planId: IdSchema,
  durationDays: z.number().int().min(1).max(3650).optional(),
  trafficGb: z.number().int().nonnegative().optional(),
  remark: z.string().max(200).optional()
})

export const AdminBatchSubscriptionSchema = z.object({
  ids: z.array(IdSchema).min(1).max(500),
  action: z.enum(['extend', 'traffic', 'speed', 'groups', 'cancel']),
  extendDays: z.number().int().min(1).max(3650).optional(),
  trafficGb: z.number().int().nonnegative().optional(),
  speedLimitMbps: z.number().int().nonnegative().optional(),
  nodeGroupIds: z.array(IdSchema).optional()
})

export const AdminAuditLogSchema = z.object({
  id: IdSchema,
  actorType: z.enum(['user', 'agent', 'plugin', 'system']),
  actorId: z.string().nullish(),
  action: z.string(),
  targetType: z.string().nullish(),
  targetId: z.string().nullish(),
  ip: z.string().nullish(),
  meta: z.record(z.string(), z.unknown()).optional(),
  createdAt: DateTimeSchema
})
export type AdminAuditLog = z.infer<typeof AdminAuditLogSchema>

export const AdminLoginLogSchema = z.object({
  id: IdSchema,
  userId: IdSchema.nullish(),
  email: z.string().nullish(),
  ip: z.string().nullish(),
  userAgent: z.string().nullish(),
  success: z.boolean(),
  reason: z.string().nullish(),
  createdAt: DateTimeSchema
})
export type AdminLoginLog = z.infer<typeof AdminLoginLogSchema>

/* ── 响应封装 ── */

export const AdminUserListResponseSchema = paginated(UserSchema)
export const AdminPlanListResponseSchema = paginated(PlanSchema)
export const AdminOrderListResponseSchema = paginated(OrderSchema)
export const AdminSubscriptionListResponseSchema = paginated(SubscriptionSchema)
export const AdminNodeListResponseSchema = paginated(NodeSchema)
export const AdminPluginListResponseSchema = paginated(PluginSchema)
export const AdminPluginSourceListResponseSchema = paginated(PluginSourceSchema)
export const AdminAuditLogListResponseSchema = paginated(AdminAuditLogSchema)
export const AdminLoginLogListResponseSchema = paginated(AdminLoginLogSchema)
