import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'
import { planStatusEnum, planTypeEnum } from './enums'

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  slug: varchar('slug', { length: 64 }).notNull(),
  description: text('description'),
  type: planTypeEnum('type').notNull().default('traffic'),

  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  originalPrice: numeric('original_price', { precision: 12, scale: 2 }),
  currency: varchar('currency', { length: 3 }).notNull().default('CNY'),

  /** 总流量（GB），0 = 不限 */
  trafficGb: bigint('traffic_gb', { mode: 'number' }).notNull().default(0),
  /** 有效期（天） */
  durationDays: integer('duration_days').notNull().default(30),
  /** 同时在线设备数上限，0 = 不限 */
  deviceLimit: integer('device_limit').notNull().default(3),
  /** 限速（Mbps），0 = 不限 */
  speedLimitMbps: integer('speed_limit_mbps').notNull().default(0),
  /** 每月流量重置日（1-28） */
  resetDay: integer('reset_day'),
  /** 续费时重置流量的比例（1 = 全额重置） */
  renewResetRatio: numeric('renew_reset_ratio', { precision: 4, scale: 2 }).notNull().default('1'),

  /** null = 不限库存 */
  stock: integer('stock'),
  soldCount: integer('sold_count').notNull().default(0),

  status: planStatusEnum('status').notNull().default('draft'),
  sort: integer('sort').notNull().default(0),
  isHot: boolean('is_hot').notNull().default(false),
  tags: text('tags').array().notNull().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('plans_slug_uq').on(t.slug),
  index('plans_status_sort_idx').on(t.status, t.sort)
])

/** 商品可用的节点组 */
export const planNodeGroups = pgTable('plan_node_groups', {
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  nodeGroupId: uuid('node_group_id').notNull()
}, t => [
  primaryKey({ columns: [t.planId, t.nodeGroupId] })
])
