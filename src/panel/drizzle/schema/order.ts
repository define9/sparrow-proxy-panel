import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'
import { couponTypeEnum, orderStatusEnum, paymentStatusEnum } from './enums'

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 对外单号 */
  orderNo: varchar('order_no', { length: 32 }).notNull(),
  userId: uuid('user_id').notNull(),
  planId: uuid('plan_id').notNull(),

  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('CNY'),
  couponId: uuid('coupon_id'),

  status: orderStatusEnum('status').notNull().default('pending'),
  paymentMethod: varchar('payment_method', { length: 32 }),
  tradeNo: varchar('trade_no', { length: 64 }),

  /** 未支付自动关闭时间 */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  /** 下单时的商品快照与插件附加信息 */
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  remark: text('remark'),
  adminRemark: text('admin_remark'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('orders_order_no_uq').on(t.orderNo),
  index('orders_user_created_idx').on(t.userId, t.createdAt),
  index('orders_status_created_idx').on(t.status, t.createdAt),
  index('orders_trade_no_idx').on(t.tradeNo),
  index('orders_expires_at_idx').on(t.expiresAt)
])

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).notNull(),
  type: couponTypeEnum('type').notNull(),
  /** fixed = 金额，percent = 百分比（0-100） */
  value: numeric('value', { precision: 12, scale: 2 }).notNull(),
  /** 可用次数，null = 不限 */
  quota: integer('quota'),
  usedCount: integer('used_count').notNull().default(0),
  /** 限定商品，null = 全部适用 */
  planIds: uuid('plan_ids').array(),
  minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('coupons_code_uq').on(t.code),
  index('coupons_enabled_idx').on(t.enabled)
])

export const paymentRecords = pgTable('payment_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  gateway: varchar('gateway', { length: 32 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  status: paymentStatusEnum('status').notNull().default('pending'),
  tradeNo: varchar('trade_no', { length: 64 }),
  /** 回调原文，用于对账与排障 */
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('payment_records_order_idx').on(t.orderId),
  uniqueIndex('payment_records_gateway_trade_uq').on(t.gateway, t.tradeNo),
  index('payment_records_created_at_idx').on(t.createdAt)
])
