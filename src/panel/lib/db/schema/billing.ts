import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'
import { orderStatusEnum, planStatusEnum, planTypeEnum } from './enums'
import { users } from './identity'

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull().default(''),
    type: planTypeEnum('type').notNull().default('traffic'),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    originalPrice: numeric('original_price', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('CNY'),
    trafficGb: integer('traffic_gb').notNull().default(0),
    durationDays: integer('duration_days').notNull(),
    deviceLimit: integer('device_limit').notNull().default(1),
    speedLimitMbps: integer('speed_limit_mbps').notNull().default(0),
    stock: integer('stock'),
    soldCount: integer('sold_count').notNull().default(0),
    status: planStatusEnum('status').notNull().default('draft'),
    isHot: boolean('is_hot').notNull().default(false),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('plans_status_sort_idx').on(table.status, table.sort)]
)

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNo: text('order_no').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0.00'),
    status: orderStatusEnum('status').notNull().default('pending'),
    paymentMethod: text('payment_method'),
    tradeNo: text('trade_no'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    meta: text('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('orders_user_created_idx').on(table.userId, table.createdAt),
    index('orders_status_created_idx').on(table.status, table.createdAt),
    index('orders_trade_no_idx').on(table.tradeNo)
  ]
)

export const paymentRecords = pgTable(
  'payment_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    gateway: text('gateway').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').notNull().default('pending'),
    tradeNo: text('trade_no'),
    raw: text('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    // 幂等：同一渠道同一交易号只允许一条
    index('payment_records_gateway_trade_idx').on(table.gateway, table.tradeNo)
  ]
)

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  type: text('type').notNull().default('fixed'),
  value: numeric('value', { precision: 12, scale: 2 }).notNull(),
  quota: integer('quota').notNull().default(0),
  usedCount: integer('used_count').notNull().default(0),
  minAmount: numeric('min_amount', { precision: 12, scale: 2 }).notNull().default('0.00'),
  enabled: boolean('enabled').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/** 商品可用的节点组 */
export const planNodeGroups = pgTable(
  'plan_node_groups',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    nodeGroupId: uuid('node_group_id').notNull()
  },
  (table) => [index('plan_node_groups_plan_idx').on(table.planId)]
)
