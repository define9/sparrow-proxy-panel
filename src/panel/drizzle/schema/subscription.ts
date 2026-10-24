import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { subscriptionFormatEnum, subscriptionStatusEnum } from './enums'

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  planId: uuid('plan_id').notNull(),
  orderId: uuid('order_id'),

  /** 订阅凭据，出现在订阅 URL 中 */
  token: uuid('token').notNull(),
  format: subscriptionFormatEnum('format').notNull().default('v2ray'),
  status: subscriptionStatusEnum('status').notNull().default('active'),

  deviceLimit: integer('device_limit').notNull().default(3),
  speedLimitMbps: integer('speed_limit_mbps').notNull().default(0),

  /** 配额与用量（字节），0 = 不限 */
  trafficLimit: bigint('traffic_limit', { mode: 'number' }).notNull().default(0),
  trafficUsed: bigint('traffic_used', { mode: 'number' }).notNull().default(0),
  upload: bigint('upload', { mode: 'number' }).notNull().default(0),
  download: bigint('download', { mode: 'number' }).notNull().default(0),

  expireAt: timestamp('expire_at', { withTimezone: true }),
  /** 下次流量重置时间 */
  resetAt: timestamp('reset_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('subscriptions_token_uq').on(t.token),
  // 同一商品不允许并存两个有效订阅
  uniqueIndex('subscriptions_user_plan_active_uq')
    .on(t.userId, t.planId)
    .where(sql`status in ('active', 'paused')`),
  index('subscriptions_user_status_idx').on(t.userId, t.status),
  index('subscriptions_expire_at_idx').on(t.expireAt),
  index('subscriptions_reset_at_idx').on(t.resetAt)
])

/** 订阅实际可见的节点组（商品默认 + 管理员调整） */
export const subscriptionNodeGroups = pgTable('subscription_node_groups', {
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  nodeGroupId: uuid('node_group_id').notNull()
}, t => [
  primaryKey({ columns: [t.subscriptionId, t.nodeGroupId] })
])
