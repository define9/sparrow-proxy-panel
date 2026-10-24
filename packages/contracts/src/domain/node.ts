import { z } from 'zod'
import { DateTimeSchema, IdSchema } from '../common'

export const NodeProtocolSchema = z.enum(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic'])
export type NodeProtocol = z.infer<typeof NodeProtocolSchema>

export const NodeTransportSchema = z.enum(['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic'])
export type NodeTransport = z.infer<typeof NodeTransportSchema>

export const NodeTlsModeSchema = z.enum(['none', 'tls', 'reality'])
export type NodeTlsMode = z.infer<typeof NodeTlsModeSchema>

export const NodeStatusSchema = z.enum(['online', 'offline', 'maintenance'])
export type NodeStatus = z.infer<typeof NodeStatusSchema>

export const NodeGroupSchema = z.object({
  id: IdSchema,
  name: z.string(),
  sort: z.number().int(),
  region: z.string().nullish(),
  remark: z.string().nullish(),
  nodeCount: z.number().int().nonnegative().optional(),
  onlineCount: z.number().int().nonnegative().optional()
})
export type NodeGroup = z.infer<typeof NodeGroupSchema>

export const NodeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  groupId: IdSchema,
  groupName: z.string().nullish(),
  protocol: NodeProtocolSchema,
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  serverPort: z.number().int().min(1).max(65535).nullish(),
  network: NodeTransportSchema,
  path: z.string().nullish(),
  hostHeader: z.string().nullish(),
  method: z.string().nullish(),
  flow: z.string().nullish(),
  password: z.string().nullish(),
  uuid: z.string().nullish(),
  security: z.string().nullish(),
  tlsMode: NodeTlsModeSchema,
  sni: z.string().nullish(),
  alpn: z.array(z.string()).default([]),
  allowInsecure: z.boolean().default(false),
  realityPublicKey: z.string().nullish(),
  realityShortId: z.string().nullish(),
  fingerprint: z.string().nullish(),
  certificateId: IdSchema.nullish(),
  trafficRate: z.number().min(0).max(100),
  priority: z.number().int(),
  weight: z.number().int().min(0).max(1000),
  status: NodeStatusSchema,
  isRelay: z.boolean(),
  sort: z.number().int(),
  remark: z.string().nullish(),
  lastSeenAt: DateTimeSchema.nullish(),
  createdAt: DateTimeSchema
})
export type Node = z.infer<typeof NodeSchema>

export const UpsertNodeSchema = z.object({
  name: z.string().trim().min(1).max(128),
  groupId: IdSchema,
  protocol: NodeProtocolSchema,
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  serverPort: z.number().int().min(1).max(65535).nullish(),
  network: NodeTransportSchema.default('tcp'),
  path: z.string().nullish(),
  hostHeader: z.string().nullish(),
  method: z.string().nullish(),
  flow: z.string().nullish(),
  password: z.string().nullish(),
  uuid: z.string().nullish(),
  security: z.string().nullish(),
  tlsMode: NodeTlsModeSchema.default('none'),
  sni: z.string().nullish(),
  alpn: z.array(z.string()).default([]),
  allowInsecure: z.boolean().default(false),
  realityPublicKey: z.string().nullish(),
  realityShortId: z.string().nullish(),
  fingerprint: z.string().nullish(),
  certificateId: IdSchema.nullish(),
  trafficRate: z.number().min(0).max(100).default(1),
  priority: z.number().int().default(0),
  weight: z.number().int().min(0).max(1000).default(100),
  status: NodeStatusSchema.default('online'),
  isRelay: z.boolean().default(false),
  sort: z.number().int().default(0),
  remark: z.string().nullish()
})
export type UpsertNode = z.infer<typeof UpsertNodeSchema>

export const NodeHeartbeatSchema = z.object({
  nodeId: IdSchema,
  status: z.enum(['online', 'offline', 'degraded']),
  cpu: z.number().min(0).max(100).nullish(),
  memory: z.number().min(0).max(100).nullish(),
  disk: z.number().min(0).max(100).nullish(),
  netRx: z.number().int().nonnegative(),
  netTx: z.number().int().nonnegative(),
  onlineUsers: z.number().int().nonnegative().nullish(),
  agentVersion: z.string().nullish(),
  coreVersion: z.string().nullish(),
  reportedAt: DateTimeSchema
})
export type NodeHeartbeat = z.infer<typeof NodeHeartbeatSchema>
