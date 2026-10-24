import { z } from 'zod'
import { BytesSchema, DateTimeSchema, IdSchema } from '../common'
import { CoreCertificateSchema, CoreConfigSchema, CoreTypeSchema, CoreUserRuleSchema } from '../node/core-config'

/* ────────────────────────── 注册 ────────────────────────── */

export const AgentRegisterRequestSchema = z.object({
  hostname: z.string().min(1).max(255),
  ip: z.string().min(1).max(64).nullish(),
  agentVersion: z.string().min(1).max(32),
  os: z.string().min(1).max(32),
  arch: z.string().min(1).max(32),
  core: CoreTypeSchema.nullish()
}).meta({ id: 'AgentRegisterRequest' })
export type AgentRegisterRequest = z.infer<typeof AgentRegisterRequestSchema>

export const AgentRegisterResponseSchema = z.object({
  nodeId: IdSchema,
  /** 节点密钥：仅在注册时返回一次，之后不可再取 */
  nodeSecret: z.string().min(16),
  heartbeatInterval: z.number().int().min(5),
  configPollInterval: z.number().int().min(30)
}).meta({ id: 'AgentRegisterResponse' })
export type AgentRegisterResponse = z.infer<typeof AgentRegisterResponseSchema>

/* ────────────────────────── 心跳 ────────────────────────── */

export const AgentHeartbeatRequestSchema = z.object({
  status: z.enum(['online', 'offline', 'degraded']),
  cpu: z.number().min(0).max(100).nullish(),
  memory: z.number().min(0).max(100).nullish(),
  disk: z.number().min(0).max(100).nullish(),
  netRx: BytesSchema,
  netTx: BytesSchema,
  onlineUsers: z.number().int().nonnegative().nullish(),
  agentVersion: z.string().min(1).max(32),
  coreVersion: z.string().min(1).max(32).nullish(),
  core: CoreTypeSchema.nullish(),
  reportedAt: DateTimeSchema
}).meta({ id: 'AgentHeartbeatRequest' })
export type AgentHeartbeatRequest = z.infer<typeof AgentHeartbeatRequestSchema>

export const AgentHeartbeatResponseSchema = z.object({
  ack: z.boolean(),
  configVersion: z.number().int().nonnegative(),
  minAgentVersion: z.string().nullish()
}).meta({ id: 'AgentHeartbeatResponse' })
export type AgentHeartbeatResponse = z.infer<typeof AgentHeartbeatResponseSchema>

/* ────────────────────────── 配置下发 ────────────────────────── */

export const AgentConfigResponseSchema = z.object({
  version: z.number().int().nonnegative(),
  core: CoreTypeSchema,
  config: CoreConfigSchema,
  rules: z.object({
    users: z.array(CoreUserRuleSchema)
  }),
  certificates: z.array(CoreCertificateSchema).default([]),
  /** 是否需要重载内核（false 表示仅需新增规则） */
  reload: z.boolean().default(true)
}).meta({ id: 'AgentConfigResponse' })
export type AgentConfigResponse = z.infer<typeof AgentConfigResponseSchema>

/* ────────────────────────── 流量上报 ────────────────────────── */

export const AgentTrafficReportSchema = z.object({
  /** 单调递增序号，用于幂等去重 */
  seq: z.number().int().nonnegative(),
  items: z.array(z.object({
    uid: z.number().int().nonnegative(),
    upload: BytesSchema,
    download: BytesSchema
  })).max(10000)
}).meta({ id: 'AgentTrafficReport' })
export type AgentTrafficReport = z.infer<typeof AgentTrafficReportSchema>

export const AgentTrafficResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative()
}).meta({ id: 'AgentTrafficResponse' })
export type AgentTrafficResponse = z.infer<typeof AgentTrafficResponseSchema>

/* ────────────────────────── 命令 ────────────────────────── */

export const AgentCommandTypeSchema = z.enum([
  'reload_config',
  'restart_core',
  'upgrade_core',
  'update_agent',
  'set_log_level',
  'sync_now'
])
export type AgentCommandType = z.infer<typeof AgentCommandTypeSchema>

export const AgentCommandSchema = z.object({
  id: IdSchema,
  command: AgentCommandTypeSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  issuedAt: DateTimeSchema
}).meta({ id: 'AgentCommand' })
export type AgentCommand = z.infer<typeof AgentCommandSchema>

export const AgentCommandsResponseSchema = z.object({
  commands: z.array(AgentCommandSchema)
}).meta({ id: 'AgentCommandsResponse' })
export type AgentCommandsResponse = z.infer<typeof AgentCommandsResponseSchema>

export const AgentCommandAckSchema = z.object({
  status: z.enum(['success', 'failed']),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional()
}).meta({ id: 'AgentCommandAck' })
export type AgentCommandAck = z.infer<typeof AgentCommandAckSchema>

/* ────────────────────────── 事件上报 ────────────────────────── */

export const AgentEventSchema = z.object({
  type: z.string().min(1).max(64),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string().max(2000),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: DateTimeSchema
}).meta({ id: 'AgentEvent' })
export type AgentEvent = z.infer<typeof AgentEventSchema>

export const AgentEventsResponseSchema = z.object({
  accepted: z.number().int().nonnegative()
}).meta({ id: 'AgentEventsResponse' })
export type AgentEventsResponse = z.infer<typeof AgentEventsResponseSchema>
