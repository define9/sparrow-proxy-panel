import { sql } from 'drizzle-orm'
import {
  bigint,
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
import {
  agentCommandEnum,
  agentCommandStatusEnum,
  agentEventLevelEnum,
  certificateSourceEnum,
  certificateTypeEnum,
  nodeHealthEnum,
  nodeProtocolEnum,
  nodeStatusEnum,
  nodeTlsModeEnum,
  nodeTransportEnum
} from './enums'

export const nodeGroups = pgTable('node_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  sort: integer('sort').notNull().default(0),
  region: varchar('region', { length: 64 }),
  remark: text('remark'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  uniqueIndex('node_groups_name_uq').on(t.name),
  index('node_groups_sort_idx').on(t.sort)
])

export const nodeCertificates = pgTable('node_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  type: certificateTypeEnum('type').notNull().default('custom'),
  source: certificateSourceEnum('source').notNull().default('manual'),
  /** PEM 证书 */
  cert: text('cert').notNull(),
  /** 私钥（AES-GCM 加密存储） */
  key: text('key').notNull(),
  issuer: varchar('issuer', { length: 255 }),
  notBefore: timestamp('not_before', { withTimezone: true }),
  notAfter: timestamp('not_after', { withTimezone: true }),
  /** ACME 续签配置 */
  acmeConfig: jsonb('acme_config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('node_certificates_not_after_idx').on(t.notAfter)
])

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  groupId: uuid('group_id').notNull(),

  protocol: nodeProtocolEnum('protocol').notNull(),
  host: varchar('host', { length: 255 }).notNull(),
  port: integer('port').notNull(),
  /** 实际监听端口（与对外端口不同时填写） */
  serverPort: integer('server_port'),

  network: nodeTransportEnum('network').notNull().default('tcp'),
  path: varchar('path', { length: 255 }),
  hostHeader: varchar('host_header', { length: 255 }),
  method: varchar('method', { length: 64 }),
  flow: varchar('flow', { length: 32 }),
  password: text('password'),
  uuid: varchar('uuid', { length: 64 }),
  security: varchar('security', { length: 32 }),

  tlsMode: nodeTlsModeEnum('tls_mode').notNull().default('none'),
  sni: varchar('sni', { length: 255 }),
  alpn: text('alpn').array().notNull().default(sql`ARRAY[]::text[]`),
  allowInsecure: boolean('allow_insecure').notNull().default(false),
  realityPublicKey: varchar('reality_public_key', { length: 255 }),
  realityShortId: varchar('reality_short_id', { length: 64 }),
  realitySpiderX: varchar('reality_spider_x', { length: 255 }),
  fingerprint: varchar('fingerprint', { length: 32 }),
  /** REALITY 私钥（AES-GCM 加密存储） */
  privateKey: text('private_key'),
  publicKey: varchar('public_key', { length: 255 }),
  certificateId: uuid('certificate_id').references(() => nodeCertificates.id, { onDelete: 'set null' }),

  /** 协议特有参数 */
  extra: jsonb('extra').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

  /** 计费倍率 */
  trafficRate: numeric('traffic_rate', { precision: 5, scale: 2 }).notNull().default('1'),
  priority: integer('priority').notNull().default(0),
  weight: integer('weight').notNull().default(100),

  status: nodeStatusEnum('status').notNull().default('online'),
  isRelay: boolean('is_relay').notNull().default(false),
  sort: integer('sort').notNull().default(0),
  remark: text('remark'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('nodes_group_idx').on(t.groupId),
  index('nodes_status_sort_idx').on(t.status, t.sort),
  index('nodes_host_port_idx').on(t.host, t.port)
])

/** 节点密钥（HMAC 签名用），与节点一对一 */
export const nodeSecrets = pgTable('node_secrets', {
  nodeId: uuid('node_id').primaryKey().references(() => nodes.id, { onDelete: 'cascade' }),
  /** 加密存储的节点密钥 */
  secret: text('secret').notNull(),
  /** 轮换过渡期内的旧密钥 */
  previousSecret: text('previous_secret'),
  previousSecretExpireAt: timestamp('previous_secret_expire_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

/** 每个节点仅保留最新一次心跳 */
export const nodeHeartbeats = pgTable('node_heartbeats', {
  nodeId: uuid('node_id').primaryKey().references(() => nodes.id, { onDelete: 'cascade' }),
  status: nodeHealthEnum('status').notNull().default('offline'),
  cpu: numeric('cpu', { precision: 5, scale: 2 }),
  memory: numeric('memory', { precision: 5, scale: 2 }),
  disk: numeric('disk', { precision: 5, scale: 2 }),
  netRx: bigint('net_rx', { mode: 'number' }).notNull().default(0),
  netTx: bigint('net_tx', { mode: 'number' }).notNull().default(0),
  onlineUsers: integer('online_users'),
  agentVersion: varchar('agent_version', { length: 32 }),
  coreVersion: varchar('core_version', { length: 32 }),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow()
})

/** 下发给节点的配置缓存（带版本号，用于 304 判断） */
export const nodeConfigs = pgTable('node_configs', {
  nodeId: uuid('node_id').primaryKey().references(() => nodes.id, { onDelete: 'cascade' }),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  renderedAt: timestamp('rendered_at', { withTimezone: true }).notNull().defaultNow()
})

/** 下行命令队列 */
export const agentCommands = pgTable('agent_commands', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeId: uuid('node_id').notNull(),
  command: agentCommandEnum('command').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  status: agentCommandStatusEnum('status').notNull().default('pending'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  ackedAt: timestamp('acked_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  result: jsonb('result').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`)
}, t => [
  index('agent_commands_node_status_idx').on(t.nodeId, t.status),
  index('agent_commands_issued_at_idx').on(t.issuedAt)
])

/** 节点上报的事件（崩溃、证书过期等） */
export const agentEvents = pgTable('agent_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  nodeId: uuid('node_id').notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  level: agentEventLevelEnum('level').notNull().default('info'),
  message: text('message').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, t => [
  index('agent_events_node_created_idx').on(t.nodeId, t.createdAt),
  index('agent_events_created_at_idx').on(t.createdAt)
])
