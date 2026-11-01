import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'
import { subscriptionFormatEnum, subscriptionStatusEnum } from './enums'
import { plans } from './billing'
import { users } from './identity'

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    orderId: uuid('order_id'),
    /** 订阅凭据，URL 里使用 */
    token: text('token').notNull().unique(),
    format: subscriptionFormatEnum('format').notNull().default('clash'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    deviceLimit: integer('device_limit').notNull().default(1),
    speedLimitMbps: integer('speed_limit_mbps').notNull().default(0),
    trafficLimit: numeric('traffic_limit', { precision: 20, scale: 0 }).notNull().default('0'),
    trafficUsed: numeric('traffic_used', { precision: 20, scale: 0 }).notNull().default('0'),
    upload: numeric('upload', { precision: 20, scale: 0 }).notNull().default('0'),
    download: numeric('download', { precision: 20, scale: 0 }).notNull().default('0'),
    expireAt: timestamp('expire_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('subscriptions_user_status_idx').on(table.userId, table.status),
    index('subscriptions_expire_idx').on(table.expireAt)
  ]
)

export const subscriptionNodeGroups = pgTable(
  'subscription_node_groups',
  {
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    nodeGroupId: uuid('node_group_id').notNull()
  },
  (table) => [index('subscription_node_groups_sub_idx').on(table.subscriptionId)]
)

export const trafficDaily = pgTable(
  'traffic_daily',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    upload: numeric('upload', { precision: 20, scale: 0 }).notNull().default('0'),
    download: numeric('download', { precision: 20, scale: 0 }).notNull().default('0'),
    total: numeric('total', { precision: 20, scale: 0 }).notNull().default('0')
  },
  (table) => [index('traffic_daily_user_date_idx').on(table.userId, table.date)]
)

export const trafficDailyNode = pgTable(
  'traffic_daily_node',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id').notNull(),
    userId: uuid('user_id').notNull(),
    date: text('date').notNull(),
    upload: numeric('upload', { precision: 20, scale: 0 }).notNull().default('0'),
    download: numeric('download', { precision: 20, scale: 0 }).notNull().default('0')
  },
  (table) => [index('traffic_daily_node_date_idx').on(table.date, table.nodeId)]
)

/** 用于聚合的原始增量（Agent 上报后先落这里，再由任务汇总） */
export const trafficLogs = pgTable(
  'traffic_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    nodeId: uuid('node_id').notNull(),
    upload: numeric('upload', { precision: 20, scale: 0 }).notNull().default('0'),
    download: numeric('download', { precision: 20, scale: 0 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('traffic_logs_created_idx').on(table.createdAt)]
)
