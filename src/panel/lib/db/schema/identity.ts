import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { actorTypeEnum, logLevelEnum, userStatusEnum } from './enums'

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  /** 权限点数组；['*'] 表示全量 */
  permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    roleCode: text('role_code').notNull().default('user'),
    status: userStatusEnum('status').notNull().default('active'),
    balance: numeric('balance', { precision: 20, scale: 2 }).notNull().default('0.00'),
    trafficLimit: numeric('traffic_limit', { precision: 20, scale: 0 }).notNull().default('0'),
    trafficUsed: numeric('traffic_used', { precision: 20, scale: 0 }).notNull().default('0'),
    twofaEnabled: boolean('twofa_enabled').notNull().default(false),
    twofaSecret: text('twofa_secret'),
    telegramId: text('telegram_id'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    remark: text('remark'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
    uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`),
    index('users_status_idx').on(table.status),
    index('users_created_at_idx').on(table.createdAt)
  ]
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 只存 sha256(token) */
    tokenHash: text('token_hash').notNull().unique(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (table) => [index('sessions_user_idx').on(table.userId)]
)

export const personalAccessTokens = pgTable(
  'personal_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('pat_user_idx').on(table.userId)]
)

export const loginLogs = pgTable(
  'login_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    success: boolean('success').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('login_logs_created_idx').on(table.createdAt)]
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: actorTypeEnum('actor_type').notNull().default('user'),
    actorId: uuid('actor_id'),
    actorLabel: text('actor_label'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    meta: text('meta'),
    level: logLevelEnum('level').notNull().default('info'),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('audit_logs_created_idx').on(table.createdAt),
    index('audit_logs_action_idx').on(table.action)
  ]
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const taskRuns = pgTable('task_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
  meta: text('meta')
})

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  level: logLevelEnum('level').notNull().default('info'),
  scope: text('scope').notNull().default('global'),
  status: text('status').notNull().default('published'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const systemCounters = pgTable('system_counters', {
  key: text('key').primaryKey(),
  value: integer('value').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})
