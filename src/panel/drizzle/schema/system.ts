import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'
import { actorTypeEnum, announcementScopeEnum, announcementStatusEnum, taskStatusEnum } from './enums'

/** 系统设置（键值对，value 为 JSON） */
export const settings = pgTable('settings', {
  key: varchar('key', { length: 128 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  scope: announcementScopeEnum('scope').notNull().default('global'),
  status: announcementStatusEnum('status').notNull().default('draft'),
  /** 多语言内容：{ "zh-CN": "...", "en": "..." } */
  translations: jsonb('translations').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('announcements_status_published_idx').on(t.status, t.publishedAt)
])

/** 审计日志（只追加，按月分区） */
export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actorType: actorTypeEnum('actor_type').notNull(),
  actorId: varchar('actor_id', { length: 64 }),
  action: varchar('action', { length: 64 }).notNull(),
  targetType: varchar('target_type', { length: 64 }),
  targetId: varchar('target_id', { length: 64 }),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('audit_logs_actor_idx').on(t.actorType, t.actorId),
  index('audit_logs_action_created_idx').on(t.action, t.createdAt),
  index('audit_logs_created_at_idx').on(t.createdAt)
])

export const loginLogs = pgTable('login_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id'),
  email: varchar('email', { length: 320 }),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  success: boolean('success').notNull(),
  reason: varchar('reason', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('login_logs_user_idx').on(t.userId),
  index('login_logs_created_at_idx').on(t.createdAt)
])

export const taskRuns = pgTable('task_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  status: taskStatusEnum('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`)
}, t => [
  index('task_runs_name_started_idx').on(t.name, t.startedAt)
])

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  secret: varchar('secret', { length: 128 }).notNull(),
  events: text('events').array().notNull().default(sql`ARRAY[]::text[]`),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})
