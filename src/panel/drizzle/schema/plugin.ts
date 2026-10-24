import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'
import {
  pluginHookStatusEnum,
  pluginRuntimeEnum,
  pluginSourceTypeEnum,
  pluginStatusEnum,
  pluginSyncStatusEnum,
  pluginTypeEnum
} from './enums'

export const plugins = pgTable('plugins', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  version: varchar('version', { length: 32 }).notNull(),
  type: pluginTypeEnum('type').notNull(),
  runtime: pluginRuntimeEnum('runtime').notNull().default('external'),

  sourceType: pluginSourceTypeEnum('source_type').notNull().default('marketplace'),
  sourceUrl: text('source_url'),
  checksum: varchar('checksum', { length: 128 }),
  signature: varchar('signature', { length: 256 }),

  /** 插件清单（hooks / 权限 / configSchema） */
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  /** 管理员填写的配置（密钥字段加密存储） */
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  permissions: text('permissions').array().notNull().default(sql`ARRAY[]::text[]`),
  hooks: text('hooks').array().notNull().default(sql`ARRAY[]::text[]`),
  status: pluginStatusEnum('status').notNull().default('installed'),
  error: text('error'),

  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('plugins_key_uq').on(t.key),
  index('plugins_type_status_idx').on(t.type, t.status)
])

/** 插件调用记录（用于健康度与排障） */
export const pluginEvents = pgTable('plugin_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  pluginId: uuid('plugin_id').notNull(),
  hook: varchar('hook', { length: 64 }).notNull(),
  status: pluginHookStatusEnum('status').notNull(),
  durationMs: integer('duration_ms'),
  error: text('error'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('plugin_events_plugin_created_idx').on(t.pluginId, t.createdAt),
  index('plugin_events_created_at_idx').on(t.createdAt)
])

/** 三方源（插件市场 / URL / Git） */
export const pluginSources = pgTable('plugin_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  type: pluginSourceTypeEnum('type').notNull(),
  url: text('url').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastStatus: pluginSyncStatusEnum('last_status'),
  lastError: text('last_error'),
  checksum: varchar('checksum', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('plugin_sources_enabled_idx').on(t.enabled)
])
