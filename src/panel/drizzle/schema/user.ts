import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  customType,
  index,
  inet,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'
import { userStatusEnum } from './enums'

/** 大小写不敏感的字符串（邮箱） */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  }
})

/* ───────────────────────── 角色与权限 ───────────────────────── */

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('roles_code_uq').on(t.code)
])

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 128 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  groupName: varchar('group_name', { length: 64 }).notNull()
}, t => [
  uniqueIndex('permissions_code_uq').on(t.code),
  index('permissions_group_idx').on(t.groupName)
])

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' })
}, t => [
  primaryKey({ columns: [t.roleId, t.permissionId] })
])

/* ───────────────────────── 用户 ───────────────────────── */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull(),
  username: varchar('username', { length: 64 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  status: userStatusEnum('status').notNull().default('pending'),

  /** 账户余额（按量计费 / 插件消费） */
  balance: numeric('balance', { precision: 20, scale: 8 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('CNY'),

  /** 账户级总配额与已用（字节），0 = 不限 */
  trafficLimit: bigint('traffic_limit', { mode: 'number' }).notNull().default(0),
  trafficUsed: bigint('traffic_used', { mode: 'number' }).notNull().default(0),

  telegramId: varchar('telegram_id', { length: 64 }),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  twofaEnabled: boolean('twofa_enabled').notNull().default(false),
  /** AES-GCM 加密后的 TOTP 密钥 */
  twofaSecret: text('twofa_secret'),

  registerIp: inet('register_ip'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  remark: text('remark'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('users_email_uq').on(t.email),
  uniqueIndex('users_username_uq').on(t.username),
  uniqueIndex('users_telegram_id_uq').on(t.telegramId),
  index('users_status_idx').on(t.status),
  index('users_role_idx').on(t.roleId),
  index('users_created_at_idx').on(t.createdAt)
])

/* ───────────────────────── 会话与令牌 ───────────────────────── */

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 会话令牌的 hash，明文仅存在于 cookie */
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
}, t => [
  uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
  index('sessions_user_idx').on(t.userId),
  index('sessions_expires_at_idx').on(t.expiresAt)
])

export const personalAccessTokens = pgTable('personal_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(),
  /** 展示用前缀，例如 spx_1a2b3c */
  tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
  /** 只存 hash，明文仅创建时返回一次 */
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  scopes: text('scopes').array().notNull().default(sql`ARRAY[]::text[]`),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('pat_token_hash_uq').on(t.tokenHash),
  index('pat_user_idx').on(t.userId)
])
