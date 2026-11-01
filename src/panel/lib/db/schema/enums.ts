import { pgEnum } from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled', 'pending'])
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'cancelled',
  'expired',
  'refunded'
])
export const planTypeEnum = pgEnum('plan_type', ['traffic', 'time', 'bandwidth'])
export const planStatusEnum = pgEnum('plan_status', ['draft', 'active', 'inactive'])
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'paused',
  'expired',
  'cancelled'
])
export const subscriptionFormatEnum = pgEnum('subscription_format', ['v2ray', 'clash', 'singbox'])
export const nodeStatusEnum = pgEnum('node_status', ['online', 'offline', 'maintenance'])
export const nodeProtocolEnum = pgEnum('node_protocol', [
  'vless',
  'vmess',
  'trojan',
  'shadowsocks',
  'hysteria2',
  'tuic'
])
export const nodeNetworkEnum = pgEnum('node_network', ['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic'])
export const tlsModeEnum = pgEnum('tls_mode', ['none', 'tls', 'reality'])
export const pluginTypeEnum = pgEnum('plugin_type', [
  'payment',
  'node_source',
  'subscription',
  'notify',
  'hook',
  'ui'
])
export const pluginStatusEnum = pgEnum('plugin_status', [
  'installed',
  'disabled',
  'error',
  'installing'
])
export const pluginHealthEnum = pgEnum('plugin_health', ['healthy', 'unhealthy', 'unknown'])
export const jobStatusEnum = pgEnum('job_status', ['ok', 'failed', 'timeout', 'skipped', 'running'])
export const logLevelEnum = pgEnum('log_level', ['info', 'warn', 'error'])
export const actorTypeEnum = pgEnum('actor_type', ['user', 'agent', 'plugin', 'system'])
