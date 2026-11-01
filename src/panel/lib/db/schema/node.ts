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
import {
  nodeNetworkEnum,
  nodeProtocolEnum,
  nodeStatusEnum,
  tlsModeEnum
} from './enums'

export const nodeGroups = pgTable('node_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  region: text('region').notNull().default(''),
  sort: integer('sort').notNull().default(0),
  remark: text('remark'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const nodeCertificates = pgTable('node_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull().default('generic'),
  cert: text('cert').notNull(),
  key: text('key').notNull(),
  issuer: text('issuer'),
  notBefore: timestamp('not_before', { withTimezone: true }),
  notAfter: timestamp('not_after', { withTimezone: true }),
  source: text('source').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

export const nodes = pgTable(
  'nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => nodeGroups.id, { onDelete: 'restrict' }),
    protocol: nodeProtocolEnum('protocol').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    serverPort: integer('server_port'),
    network: nodeNetworkEnum('network').notNull().default('tcp'),
    path: text('path'),
    hostHeader: text('host_header'),
    method: text('method'),
    flow: text('flow'),
    security: text('security'),
    tlsMode: tlsModeEnum('tls_mode').notNull().default('tls'),
    sni: text('sni'),
    alpn: text('alpn').array().notNull().default(sql`'{}'::text[]`),
    allowInsecure: boolean('allow_insecure').notNull().default(false),
    realityPublicKey: text('reality_public_key'),
    realityShortId: text('reality_short_id'),
    fingerprint: text('fingerprint'),
    certificateId: uuid('certificate_id').references(() => nodeCertificates.id, {
      onDelete: 'set null'
    }),
    extra: text('extra'),
    trafficRate: numeric('traffic_rate', { precision: 5, scale: 2 }).notNull().default('1.00'),
    priority: integer('priority').notNull().default(0),
    weight: integer('weight').notNull().default(1),
    status: nodeStatusEnum('status').notNull().default('offline'),
    isRelay: boolean('is_relay').notNull().default(false),
    agentSecretHash: text('agent_secret_hash'),
    agentVersion: text('agent_version'),
    core: text('core').notNull().default('sing-box'),
    configVersion: integer('config_version').notNull().default(0),
    sort: integer('sort').notNull().default(0),
    remark: text('remark'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('nodes_group_idx').on(table.groupId),
    index('nodes_status_sort_idx').on(table.status, table.sort)
  ]
)

/** 每节点一行，心跳覆盖写 */
export const nodeHeartbeats = pgTable('node_heartbeats', {
  nodeId: uuid('node_id')
    .primaryKey()
    .references(() => nodes.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('online'),
  cpu: numeric('cpu', { precision: 5, scale: 2 }).notNull().default('0'),
  memory: numeric('memory', { precision: 5, scale: 2 }).notNull().default('0'),
  disk: numeric('disk', { precision: 5, scale: 2 }).notNull().default('0'),
  netRx: numeric('net_rx', { precision: 20, scale: 0 }).notNull().default('0'),
  netTx: numeric('net_tx', { precision: 20, scale: 0 }).notNull().default('0'),
  onlineUsers: integer('online_users').notNull().default(0),
  agentVersion: text('agent_version'),
  coreVersion: text('core_version'),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow()
})

export const agentCommands = pgTable(
  'agent_commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    command: text('command').notNull(),
    payload: text('payload'),
    status: text('status').notNull().default('pending'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    ackedAt: timestamp('acked_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    result: text('result')
  },
  (table) => [index('agent_commands_node_status_idx').on(table.nodeId, table.status)]
)

export const agentEvents = pgTable(
  'agent_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    level: text('level').notNull().default('info'),
    message: text('message'),
    payload: text('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('agent_events_created_idx').on(table.createdAt)]
)
