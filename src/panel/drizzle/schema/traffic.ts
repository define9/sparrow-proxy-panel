import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core'

/**
 * 流量明细。
 *
 * 生产环境按天分区（见 docs/architecture/data-model.md）：
 *   - 先用 drizzle-kit 生成普通表
 *   - 再执行手写迁移 `ALTER TABLE traffic_logs ... PARTITION BY RANGE (created_at)`
 *   - 每日创建新分区，过期分区直接 DROP
 */
export const trafficLogs = pgTable('traffic_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull(),
  nodeId: uuid('node_id').notNull(),
  subscriptionId: uuid('subscription_id'),
  upload: bigint('upload', { mode: 'number' }).notNull().default(0),
  download: bigint('download', { mode: 'number' }).notNull().default(0),
  total: bigint('total', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('traffic_logs_user_created_idx').on(t.userId, t.createdAt),
  index('traffic_logs_node_created_idx').on(t.nodeId, t.createdAt),
  index('traffic_logs_created_at_idx').on(t.createdAt)
])

/** 用户维度日汇总 */
export const trafficDaily = pgTable('traffic_daily', {
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  upload: bigint('upload', { mode: 'number' }).notNull().default(0),
  download: bigint('download', { mode: 'number' }).notNull().default(0),
  total: bigint('total', { mode: 'number' }).notNull().default(0),
  nodeCount: integer('node_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  primaryKey({ columns: [t.userId, t.date] }),
  index('traffic_daily_date_idx').on(t.date)
])

/** 节点 × 用户维度日汇总（用于节点流量排行） */
export const trafficDailyNode = pgTable('traffic_daily_node', {
  nodeId: uuid('node_id').notNull(),
  userId: uuid('user_id').notNull(),
  date: date('date').notNull(),
  upload: bigint('upload', { mode: 'number' }).notNull().default(0),
  download: bigint('download', { mode: 'number' }).notNull().default(0),
  total: bigint('total', { mode: 'number' }).notNull().default(0)
}, t => [
  primaryKey({ columns: [t.nodeId, t.userId, t.date] }),
  index('traffic_daily_node_node_date_idx').on(t.nodeId, t.date),
  index('traffic_daily_node_user_date_idx').on(t.userId, t.date)
])
