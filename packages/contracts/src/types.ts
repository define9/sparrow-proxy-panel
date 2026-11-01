import { z } from 'zod'

/** 金额统一用字符串传递，避免 JS 浮点误差 */
export const money = z.string().regex(/^-?\d+(\.\d{1,2})?$/)

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().default(''),
  type: z.enum(['traffic', 'time', 'bandwidth']),
  price: money,
  originalPrice: money.nullable().default(null),
  trafficGb: z.number().int().nonnegative(),
  durationDays: z.number().int().positive(),
  deviceLimit: z.number().int().nonnegative(),
  speedLimitMbps: z.number().int().nonnegative(),
  stock: z.number().int().nullable(),
  soldCount: z.number().int().nonnegative(),
  status: z.enum(['draft', 'active', 'inactive']),
  isHot: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  sort: z.number().int().default(0)
})
export type Plan = z.infer<typeof planSchema>

export const orderStatus = z.enum(['pending', 'paid', 'cancelled', 'expired', 'refunded'])
export type OrderStatus = z.infer<typeof orderStatus>

export const orderSchema = z.object({
  id: z.string(),
  orderNo: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  planId: z.string(),
  planName: z.string(),
  amount: money,
  discount: money.default('0.00'),
  status: orderStatus,
  paymentMethod: z.string().nullable().default(null),
  tradeNo: z.string().nullable().default(null),
  expiresAt: z.string(),
  paidAt: z.string().nullable().default(null),
  createdAt: z.string()
})
export type Order = z.infer<typeof orderSchema>

export const subscriptionStatus = z.enum(['active', 'paused', 'expired', 'cancelled'])
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>

export const subscriptionSchema = z.object({
  id: z.string(),
  token: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  planId: z.string(),
  planName: z.string(),
  status: subscriptionStatus,
  format: z.enum(['v2ray', 'clash', 'singbox']),
  deviceLimit: z.number().int(),
  speedLimitMbps: z.number().int(),
  trafficLimit: z.number().int(),
  trafficUsed: z.number().int(),
  upload: z.number().int(),
  download: z.number().int(),
  expireAt: z.string(),
  createdAt: z.string()
})
export type Subscription = z.infer<typeof subscriptionSchema>

export const nodeStatus = z.enum(['online', 'offline', 'maintenance'])
export type NodeStatus = z.infer<typeof nodeStatus>

export const nodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupId: z.string(),
  groupName: z.string(),
  protocol: z.enum(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic']),
  host: z.string(),
  port: z.number().int(),
  network: z.enum(['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic']),
  tlsMode: z.enum(['none', 'tls', 'reality']),
  rate: z.number(),
  status: nodeStatus,
  onlineUsers: z.number().int(),
  cpu: z.number(),
  memory: z.number(),
  agentVersion: z.string(),
  core: z.enum(['sing-box', 'xray']),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string()
})
export type Node = z.infer<typeof nodeSchema>

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  role: z.enum(['user', 'admin', 'superadmin']),
  status: z.enum(['active', 'disabled', 'pending']),
  balance: money.default('0.00'),
  trafficLimit: z.number().int(),
  trafficUsed: z.number().int(),
  twofaEnabled: z.boolean(),
  telegramId: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string()
})
export type User = z.infer<typeof userSchema>

export const pluginSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  version: z.string(),
  type: z.enum(['payment', 'node_source', 'subscription', 'notify', 'hook', 'ui']),
  repoUrl: z.string(),
  commitSha: z.string(),
  status: z.enum(['installed', 'disabled', 'error', 'installing']),
  health: z.enum(['healthy', 'unhealthy', 'unknown']),
  signed: z.boolean(),
  permissions: z.array(z.string()),
  hooks: z.array(z.string()).default([]),
  jobs: z
    .array(z.object({ key: z.string(), cron: z.string(), nextRunAt: z.string() }))
    .default([]),
  lastError: z.string().nullable(),
  installedAt: z.string()
})
export type Plugin = z.infer<typeof pluginSchema>

export const logEntrySchema = z.object({
  id: z.string(),
  category: z.enum(['audit', 'login', 'task', 'agent']),
  level: z.enum(['info', 'warn', 'error']),
  actor: z.string(),
  action: z.string(),
  target: z.string(),
  ip: z.string().nullable(),
  message: z.string(),
  createdAt: z.string()
})
export type LogEntry = z.infer<typeof logEntrySchema>

export const listMetaSchema = z.object({
  total: z.number().int(),
  nextCursor: z.string().nullable().default(null),
  hasMore: z.boolean().default(false)
})

export type ListResult<T> = { data: T[]; meta: z.infer<typeof listMetaSchema> }
