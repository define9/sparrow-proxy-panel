import { pgEnum } from 'drizzle-orm/pg-core'

/* 身份 */
export const userStatusEnum = pgEnum('user_status', ['active', 'disabled', 'pending'])

/* 商品与订单 */
export const planTypeEnum = pgEnum('plan_type', ['traffic', 'time', 'bandwidth'])
export const planStatusEnum = pgEnum('plan_status', ['draft', 'active', 'inactive'])
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'cancelled', 'expired', 'refunded'])
export const couponTypeEnum = pgEnum('coupon_type', ['fixed', 'percent'])
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'success', 'failed'])

/* 订阅 */
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'paused', 'expired', 'cancelled'])
export const subscriptionFormatEnum = pgEnum('subscription_format', ['v2ray', 'clash', 'singbox'])

/* 节点 */
export const nodeProtocolEnum = pgEnum('node_protocol', ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic'])
export const nodeTransportEnum = pgEnum('node_transport', ['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic'])
export const nodeTlsModeEnum = pgEnum('node_tls_mode', ['none', 'tls', 'reality'])
export const nodeStatusEnum = pgEnum('node_status', ['online', 'offline', 'maintenance'])
export const nodeHealthEnum = pgEnum('node_health', ['online', 'offline', 'degraded'])
export const certificateTypeEnum = pgEnum('certificate_type', ['generic', 'custom'])
export const certificateSourceEnum = pgEnum('certificate_source', ['acme', 'manual'])

/* Agent 通信 */
export const agentCommandEnum = pgEnum('agent_command', [
  'reload_config',
  'restart_core',
  'upgrade_core',
  'update_agent',
  'set_log_level',
  'sync_now'
])
export const agentCommandStatusEnum = pgEnum('agent_command_status', ['pending', 'acked', 'done', 'failed'])
export const agentEventLevelEnum = pgEnum('agent_event_level', ['info', 'warn', 'error'])

/* 插件 */
export const pluginTypeEnum = pgEnum('plugin_type', ['payment', 'node_source', 'subscription', 'notify', 'hook', 'ui'])
export const pluginRuntimeEnum = pgEnum('plugin_runtime', ['builtin', 'external'])
export const pluginStatusEnum = pgEnum('plugin_status', ['installed', 'disabled', 'error'])
export const pluginSourceTypeEnum = pgEnum('plugin_source_type', ['builtin', 'marketplace', 'url', 'upload'])
export const pluginSyncStatusEnum = pgEnum('plugin_sync_status', ['pending', 'success', 'failed'])
export const pluginHookStatusEnum = pgEnum('plugin_hook_status', ['success', 'error', 'timeout'])

/* 系统 */
export const announcementScopeEnum = pgEnum('announcement_scope', ['global', 'user', 'admin'])
export const announcementStatusEnum = pgEnum('announcement_status', ['draft', 'published', 'archived'])
export const actorTypeEnum = pgEnum('actor_type', ['user', 'agent', 'plugin', 'system'])
export const taskStatusEnum = pgEnum('task_status', ['running', 'success', 'failed'])
