import type { LogEntry, Plugin } from '@sparrow/contracts'
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '@sparrow/contracts/permissions'
import { orders, subscriptions } from './catalog'
import { iso } from './util'

/**
 * 管理端运营页演示数据（用户 / 插件 / 索引源 / 日志 / 优惠券 / 系统设置）。
 * 全部按固定种子生成，刷新不变；只读，页面直接 import。
 */

const GB = 1024 ** 3

/* ------------------------------------------------------------------ 用户 */

export type UserRole = 'user' | 'admin' | 'superadmin'
/** 复用 StateBadge 已有的用户态：verified / unverified / banned */
export type UserStatus = 'verified' | 'unverified' | 'banned'

export interface UserSession {
  id: string
  device: string
  browser: string
  ip: string
  location: string
  lastActiveAt: string
  current: boolean
}

export interface AdminUser {
  id: string
  email: string
  username: string
  role: UserRole
  status: UserStatus
  balance: string
  trafficUsed: number
  trafficLimit: number
  createdAt: string
  lastLoginAt: string | null
  sessions: UserSession[]
}

/** 从订单 / 订阅里派生已有用户，再补几个演示账号 */
const derivedEmails = Array.from(
  new Set([...orders.map((order) => order.userEmail), ...subscriptions.map((sub) => sub.userEmail)])
)

const extraEmails = [
  'ivy@example.com',
  'sol@example.com',
  'ravi@example.com',
  'mika@example.com',
  'otto@example.com',
  'yuan@example.com'
]

const LIMITS_GB = [200, 0, 200, 60, 500, 200, 0, 200, 60, 500, 200, 60]
const USED_RATIO = [0.41, 0.12, 0.98, 0.33, 0.55, 0.07, 0.62, 0.78, 0.21, 0.44, 0.09, 0.86]

const DEVICES: Array<[string, string]> = [
  ['MacBook Pro', 'Chrome 141'],
  ['iPhone 16', 'Safari 18'],
  ['Windows 11', 'Edge 141'],
  ['Pixel 9', 'Chrome 141']
]

export const users: AdminUser[] = [...derivedEmails, ...extraEmails].map((email, index) => {
  const status: UserStatus =
    index < 2 ? 'verified' : index % 5 === 3 ? 'banned' : index % 4 === 2 ? 'unverified' : 'verified'
  const limitGb = LIMITS_GB[index % LIMITS_GB.length]
  const [device, browser] = DEVICES[index % DEVICES.length]

  return {
    id: `usr_${String(index + 1).padStart(8, '0')}`,
    email,
    username: email.split('@')[0],
    role: index === 0 ? 'superadmin' : index === 1 ? 'admin' : 'user',
    status,
    balance: (((index * 53) % 240) + 0.5).toFixed(2),
    trafficUsed: Math.round(limitGb * GB * USED_RATIO[index % USED_RATIO.length]),
    trafficLimit: limitGb * GB,
    createdAt: iso(-(32 + index * 27)),
    lastLoginAt: status === 'banned' ? null : iso(0, -(index * 3 + 1)),
    sessions:
      status === 'banned'
        ? []
        : [
            {
              id: `ses_${index}_1`,
              device,
              browser,
              ip: `203.0.113.${10 + index}`,
              location: index % 3 === 0 ? '上海' : index % 3 === 1 ? '深圳' : '杭州',
              lastActiveAt: iso(0, -(index + 1)),
              current: true
            },
            {
              id: `ses_${index}_2`,
              device: 'iPad Air',
              browser: 'Safari 18',
              ip: `198.51.100.${20 + index}`,
              location: '北京',
              lastActiveAt: iso(0, -(index * 2 + 12)),
              current: false
            }
          ]
  }
})

export const userSummary = {
  total: 12874,
  newToday: 43,
  banned: users.filter((user) => user.status === 'banned').length,
  unverified: users.filter((user) => user.status === 'unverified').length
}

/* ------------------------------------------------------------------ 插件 */

export type PluginType = Plugin['type']
export type PluginStatus = Plugin['status']
export type PluginHealth = Plugin['health']

export interface PluginJob {
  key: string
  cron: string
  nextRunAt: string
  lastStatus: 'success' | 'failed' | 'skipped'
  lastRunAt: string
  durationMs: number
}

export interface PluginConfigField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'switch'
  value: string
  description?: string
  secret?: boolean
}

export interface PluginEvent {
  id: string
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface AdminPlugin {
  id: string
  key: string
  name: string
  version: string
  type: PluginType
  description: string
  author: string
  repoUrl: string
  commitSha: string
  status: PluginStatus
  health: PluginHealth
  signed: boolean
  permissions: string[]
  egress: string[]
  hooks: string[]
  compatibility: string
  jobs: PluginJob[]
  config: PluginConfigField[]
  events: PluginEvent[]
  lastError: string | null
  installedAt: string
}

export const pluginTypeLabels: Record<PluginType, string> = {
  payment: '支付',
  node_source: '节点源',
  subscription: '订阅',
  notify: '通知',
  hook: '钩子',
  ui: '界面'
}

export const plugins: AdminPlugin[] = [
  {
    id: 'plg_001',
    key: 'payment-epay',
    name: '易支付',
    version: '1.2.0',
    type: 'payment',
    description: '对接易支付聚合网关，支持支付宝与微信扫码。',
    author: 'community-dev',
    repoUrl: 'https://github.com/community/sparrow-plugin-epay',
    commitSha: '9f2c1ab7d4e5f6a8b9c0d1e2f3a4b5c6d7e8f9a0',
    status: 'installed',
    health: 'healthy',
    signed: false,
    permissions: ['order:read', 'order:write', 'settings:read'],
    egress: ['api.epay.example.com'],
    hooks: ['order.created', 'order.paid', 'payment.callback'],
    compatibility: '>=0.1.0 <1.0.0',
    jobs: [
      {
        key: 'reconcile',
        cron: '*/5 * * * *',
        nextRunAt: iso(0, 0.2),
        lastStatus: 'success',
        lastRunAt: iso(0, -0.05),
        durationMs: 842
      }
    ],
    config: [
      { key: 'pid', label: '商户 PID', type: 'text', value: '1001', description: '易支付后台的商户编号' },
      { key: 'key', label: '商户密钥', type: 'password', value: 'e0f8c2', secret: true },
      { key: 'notifyUrl', label: '回调地址', type: 'text', value: 'https://panel.example.com/api/v1/pay/epay' }
    ],
    events: [
      { id: 'evt_0011', at: iso(0, -0.05), level: 'info', message: 'payment.reconcile 执行成功（842ms）' },
      { id: 'evt_0012', at: iso(0, -3), level: 'info', message: 'order.paid 回调处理成功 ord_000021' },
      { id: 'evt_0013', at: iso(-1, -2), level: 'warn', message: '回调验签失败被拒绝：sign mismatch' }
    ],
    lastError: null,
    installedAt: iso(-46)
  },
  {
    id: 'plg_002',
    key: 'node-source-sub',
    name: '机场订阅导入',
    version: '0.4.1',
    type: 'node_source',
    description: '从外部订阅地址批量导入节点，支持定时同步与差异预览。',
    author: 'sparrow-labs',
    repoUrl: 'https://github.com/sparrow-labs/node-source-sub',
    commitSha: '4be81d02c3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e8',
    status: 'installed',
    health: 'healthy',
    signed: true,
    permissions: ['node:read', 'node:write'],
    egress: ['sub.example.org', 'api.example.net'],
    hooks: ['node.source.fetch'],
    compatibility: '>=0.1.0 <1.0.0',
    jobs: [
      {
        key: 'sync',
        cron: '0 */6 * * *',
        nextRunAt: iso(0, 4),
        lastStatus: 'success',
        lastRunAt: iso(0, -2),
        durationMs: 3210
      }
    ],
    config: [
      { key: 'sourceUrl', label: '订阅地址', type: 'text', value: 'https://sub.example.org/api/v1/client' },
      { key: 'group', label: '导入节点组', type: 'text', value: '机场导入' },
      { key: 'autoApply', label: '自动应用差异', type: 'switch', value: 'false' }
    ],
    events: [
      { id: 'evt_0021', at: iso(0, -2), level: 'info', message: '同步完成：新增 6 个节点，更新 2 个' },
      { id: 'evt_0022', at: iso(-1, -2), level: 'info', message: '同步完成：无变化' }
    ],
    lastError: null,
    installedAt: iso(-30)
  },
  {
    id: 'plg_003',
    key: 'notify-telegram',
    name: 'Telegram 通知',
    version: '1.0.3',
    type: 'notify',
    description: '订单、节点与流量告警推送到 Telegram 群组。',
    author: 'community-dev',
    repoUrl: 'https://github.com/community/sparrow-plugin-telegram',
    commitSha: '77aa10cb12de34f567890abcdef1234567890abcd',
    status: 'disabled',
    health: 'unknown',
    signed: false,
    permissions: ['order:read', 'node:read'],
    egress: ['api.telegram.org'],
    hooks: ['order.paid', 'node.offline'],
    compatibility: '>=0.1.0 <1.0.0',
    jobs: [],
    config: [
      { key: 'botToken', label: 'Bot Token', type: 'password', value: '123456:demo', secret: true },
      { key: 'chatId', label: '群组 ID', type: 'text', value: '-100123456' }
    ],
    events: [{ id: 'evt_0031', at: iso(-4), level: 'info', message: '插件被管理员禁用' }],
    lastError: null,
    installedAt: iso(-20)
  },
  {
    id: 'plg_004',
    key: 'subscription-clash',
    name: '订阅渲染扩展',
    version: '2.1.0',
    type: 'subscription',
    description: '提供 Clash Meta 模板覆盖与规则集注入。',
    author: 'sparrow-labs',
    repoUrl: 'https://github.com/sparrow-labs/subscription-clash',
    commitSha: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2',
    status: 'installed',
    health: 'healthy',
    signed: true,
    permissions: ['subscription:read'],
    egress: [],
    hooks: ['subscription.render'],
    compatibility: '>=0.1.0 <1.0.0',
    jobs: [
      {
        key: 'rules-refresh',
        cron: '0 3 * * *',
        nextRunAt: iso(1, -5),
        lastStatus: 'success',
        lastRunAt: iso(0, -5),
        durationMs: 1280
      }
    ],
    config: [
      { key: 'template', label: '模板名称', type: 'text', value: 'meta-default' },
      { key: 'ruleSet', label: '规则集地址', type: 'text', value: 'https://rules.example.com/meta.yaml' }
    ],
    events: [{ id: 'evt_0041', at: iso(0, -5), level: 'info', message: 'rules-refresh 执行成功' }],
    lastError: null,
    installedAt: iso(-12)
  },
  {
    id: 'plg_005',
    key: 'traffic-guard',
    name: '流量熔断',
    version: '0.9.0',
    type: 'hook',
    description: '用量超过套餐阈值时自动暂停订阅并通知用户。',
    author: 'community-dev',
    repoUrl: 'https://github.com/community/sparrow-plugin-traffic-guard',
    commitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    status: 'error',
    health: 'unhealthy',
    signed: false,
    permissions: ['subscription:read', 'subscription:write', 'notify:send'],
    egress: ['hooks.example.dev'],
    hooks: ['traffic.report', 'subscription.suspend'],
    compatibility: '>=0.1.0 <1.0.0',
    jobs: [
      {
        key: 'check-quota',
        cron: '*/10 * * * *',
        nextRunAt: iso(0, 0.1),
        lastStatus: 'failed',
        lastRunAt: iso(0, -0.15),
        durationMs: 30000
      }
    ],
    config: [
      { key: 'threshold', label: '熔断阈值（%）', type: 'number', value: '100' },
      { key: 'webhook', label: '通知 Webhook', type: 'text', value: 'https://hooks.example.dev/sparrow' }
    ],
    events: [
      { id: 'evt_0051', at: iso(0, -0.15), level: 'error', message: 'hook 调用超时：traffic.report（30s）' },
      { id: 'evt_0052', at: iso(0, -0.15), level: 'warn', message: '连续失败 5 次，已自动熔断' }
    ],
    lastError: 'hook 调用超时：traffic.report（30000ms）',
    installedAt: iso(-8)
  },
  {
    id: 'plg_006',
    key: 'ui-affiliate',
    name: '推广中心',
    version: '0.2.0',
    type: 'ui',
    description: '用户中心嵌入邀请与返利页面（iframe 沙箱）。',
    author: 'community-dev',
    repoUrl: 'https://github.com/community/sparrow-plugin-affiliate',
    commitSha: 'ffeeddccbbaa99887766554433221100aabbccdd',
    status: 'installing',
    health: 'unknown',
    signed: true,
    permissions: ['user:read'],
    egress: [],
    hooks: [],
    compatibility: '>=0.1.0 <1.0.0',
    jobs: [],
    config: [
      { key: 'title', label: '页面标题', type: 'text', value: '推广中心' },
      { key: 'rewardRate', label: '返利比例（%）', type: 'number', value: '10' },
      { key: 'autoApprove', label: '自动审核提现', type: 'switch', value: 'false' }
    ],
    events: [{ id: 'evt_0061', at: iso(0, -0.02), level: 'info', message: 'materialize 完成，等待 /healthz 探活' }],
    lastError: null,
    installedAt: iso(0, -0.05)
  }
]

/** `owner/repo@sha 前 7 位` */
export function repoLabel(repoUrl: string, commitSha: string) {
  const path = repoUrl.replace(/^https?:\/\/github\.com\//, '')
  return `${path}@${commitSha.slice(0, 7)}`
}

/* -------------------------------------------------------------- 索引源 */

export type SourceType = 'url' | 'git' | 'marketplace'

export interface PluginSource {
  id: string
  name: string
  type: SourceType
  url: string
  enabled: boolean
  lastSyncedAt: string | null
  status: 'healthy' | 'error' | 'unknown'
  entries: number
  message?: string
}

export const pluginSourceTypeLabels: Record<SourceType, string> = {
  url: 'HTTP JSON',
  git: 'Git 仓库',
  marketplace: '官方市场'
}

export const pluginSources: PluginSource[] = [
  {
    id: 'src_001',
    name: 'Sparrow 官方市场',
    type: 'marketplace',
    url: 'https://marketplace.sparrow.dev/index.json',
    enabled: true,
    lastSyncedAt: iso(0, -1),
    status: 'healthy',
    entries: 42
  },
  {
    id: 'src_002',
    name: '社区精选索引',
    type: 'url',
    url: 'https://awesome-sparrow.example.com/plugins.json',
    enabled: true,
    lastSyncedAt: iso(0, -4),
    status: 'healthy',
    entries: 18
  },
  {
    id: 'src_003',
    name: '内部插件仓库',
    type: 'git',
    url: 'https://github.com/sparrow-labs/plugin-index',
    enabled: false,
    lastSyncedAt: iso(-3),
    status: 'unknown',
    entries: 7,
    message: '已停用，未参与最近同步'
  },
  {
    id: 'src_004',
    name: '旧版镜像',
    type: 'url',
    url: 'https://mirror.example.org/legacy/plugins.json',
    enabled: true,
    lastSyncedAt: iso(-1, -6),
    status: 'error',
    entries: 0,
    message: '拉取失败：HTTP 502'
  }
]

/* ------------------------------------------------------------------ 日志 */

export type LogCategory = LogEntry['category']
export type LogLevel = LogEntry['level']

export interface AdminLogEntry extends LogEntry {
  payload: Record<string, unknown>
}

export const logCategoryLabels: Record<LogCategory, string> = {
  audit: '审计',
  login: '登录',
  task: '任务',
  agent: '节点事件'
}

interface LogSeed {
  category: LogCategory
  level: LogLevel
  actor: string
  action: string
  target: string
  ip: string | null
  message: string
  hoursAgo: number
  path: string
}

const logSeeds: LogSeed[] = [
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'setting.update', target: 'settings.site', ip: '203.0.113.10', message: '更新站点设置：公告与备案信息', hoursAgo: 1, path: '/api/v1/admin/settings' },
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'user.ban', target: 'usr_00000004', ip: '203.0.113.10', message: '封禁用户 mori@example.com', hoursAgo: 2, path: '/api/v1/admin/users/usr_00000004/ban' },
  { category: 'login', level: 'info', actor: 'admin@example.com', action: 'auth.login', target: 'session', ip: '203.0.113.10', message: '管理员登录成功（TOTP 已校验）', hoursAgo: 3, path: '/api/v1/auth/login' },
  { category: 'task', level: 'info', actor: 'system', action: 'plugin.install', target: 'ui-affiliate@0.2.0', ip: null, message: '安装任务完成 materialize 阶段', hoursAgo: 3, path: '/internal/tasks/plugin.install' },
  { category: 'agent', level: 'info', actor: 'agent:jp-03', action: 'node.heartbeat', target: 'node_jp_03', ip: '198.51.100.31', message: '心跳正常，负载 0.32', hoursAgo: 4, path: '/api/v1/agent/heartbeat' },
  { category: 'audit', level: 'warn', actor: 'admin@example.com', action: 'plugin.disable', target: 'notify-telegram', ip: '203.0.113.10', message: '禁用插件 notify-telegram（配置待清理）', hoursAgo: 5, path: '/api/v1/admin/plugins/notify-telegram' },
  { category: 'task', level: 'error', actor: 'system', action: 'job.run', target: 'traffic-guard/check-quota', ip: null, message: '定时任务超时：traffic.report（30000ms）', hoursAgo: 6, path: '/internal/jobs/run' },
  { category: 'login', level: 'warn', actor: 'nana@example.com', action: 'auth.login.failed', target: 'session', ip: '192.0.2.44', message: '密码错误（第 3 次）', hoursAgo: 8, path: '/api/v1/auth/login' },
  { category: 'agent', level: 'warn', actor: 'agent:sg-01', action: 'node.traffic', target: 'node_sg_01', ip: '198.51.100.41', message: '上报间隔 180s，超过 120s 阈值', hoursAgo: 10, path: '/api/v1/agent/traffic' },
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'coupon.create', target: 'SPRING20', ip: '203.0.113.10', message: '创建优惠券 SPRING20（8 折）', hoursAgo: 12, path: '/api/v1/admin/coupons' },
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'user.balance', target: 'usr_00000002', ip: '203.0.113.10', message: '余额调整 +50.00', hoursAgo: 18, path: '/api/v1/admin/users/usr_00000002/balance' },
  { category: 'task', level: 'info', actor: 'system', action: 'job.run', target: 'payment-epay/reconcile', ip: null, message: '对账完成：2 笔订单已同步', hoursAgo: 20, path: '/internal/jobs/run' },
  { category: 'login', level: 'info', actor: 'lily@example.com', action: 'auth.login', target: 'session', ip: '203.0.113.22', message: '用户登录成功', hoursAgo: 22, path: '/api/v1/auth/login' },
  { category: 'agent', level: 'error', actor: 'agent:hk-02', action: 'node.offline', target: 'node_hk_02', ip: '198.51.100.52', message: '连续 3 次探活失败，标记离线', hoursAgo: 26, path: '/api/v1/agent/heartbeat' },
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'plan.update', target: 'plan_002', ip: '203.0.113.10', message: '更新套餐「标准月付」价格', hoursAgo: 30, path: '/api/v1/admin/plans/plan_002' },
  { category: 'task', level: 'warn', actor: 'system', action: 'job.skipped', target: 'subscription-clash/rules-refresh', ip: null, message: '上一次执行未结束，本次跳过', hoursAgo: 34, path: '/internal/jobs/run' },
  { category: 'login', level: 'error', actor: 'unknown', action: 'auth.login.blocked', target: 'session', ip: '198.51.100.77', message: 'IP 命中风控黑名单，已拦截', hoursAgo: 40, path: '/api/v1/auth/login' },
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'refund.approve', target: 'ord_000015', ip: '203.0.113.10', message: '同意退款 ¥30.00', hoursAgo: 46, path: '/api/v1/admin/orders/ord_000015/refund' },
  { category: 'agent', level: 'info', actor: 'agent:us-01', action: 'node.register', target: 'node_us_01', ip: '198.51.100.61', message: '新节点注册成功（sing-box 1.11）', hoursAgo: 52, path: '/api/v1/agent/register' },
  { category: 'task', level: 'info', actor: 'system', action: 'order.expire', target: 'batch:12', ip: null, message: '过期订单扫描完成，关闭 12 笔', hoursAgo: 60, path: '/internal/jobs/run' },
  { category: 'audit', level: 'warn', actor: 'admin@example.com', action: 'plugin.install.preview', target: 'traffic-guard', ip: '203.0.113.10', message: '未签名社区插件，管理员二次确认后安装', hoursAgo: 72, path: '/api/v1/admin/plugins/install' },
  { category: 'login', level: 'warn', actor: 'kite@example.com', action: 'auth.login.failed', target: 'session', ip: '192.0.2.61', message: '密码错误（第 1 次）', hoursAgo: 80, path: '/api/v1/auth/login' },
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'source.sync', target: 'src_002', ip: '203.0.113.10', message: '手动同步社区精选索引，发现 18 个插件', hoursAgo: 90, path: '/api/v1/admin/plugin-sources/src_002/sync' },
  { category: 'agent', level: 'info', actor: 'agent:jp-03', action: 'node.traffic', target: 'node_jp_03', ip: '198.51.100.31', message: '上报流量 4.2 GB', hoursAgo: 96, path: '/api/v1/agent/traffic' },
  { category: 'task', level: 'error', actor: 'system', action: 'job.run', target: 'payment-epay/reconcile', ip: null, message: '网关返回 502，稍后重试', hoursAgo: 120, path: '/internal/jobs/run' },
  { category: 'audit', level: 'info', actor: 'admin@example.com', action: 'user.create', target: 'usr_00000012', ip: '203.0.113.10', message: '手动创建用户 yuan@example.com', hoursAgo: 168, path: '/api/v1/admin/users' }
]

export const logs: AdminLogEntry[] = logSeeds.map((seed, index) => {
  const createdAt = iso(0, -seed.hoursAgo)
  return {
    id: `log_${String(index + 1).padStart(4, '0')}`,
    category: seed.category,
    level: seed.level,
    actor: seed.actor,
    action: seed.action,
    target: seed.target,
    ip: seed.ip,
    message: seed.message,
    createdAt,
    payload: {
      requestId: `req_${String(index + 1).padStart(6, '0')}`,
      method: 'POST',
      path: seed.path,
      statusCode: seed.level === 'error' ? 500 : seed.level === 'warn' ? 400 : 200,
      durationMs: 12 + index * 7,
      actor: seed.actor,
      action: seed.action,
      target: seed.target,
      ip: seed.ip,
      userAgent: seed.category === 'login' ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' : null,
      createdAt,
      context: {
        service: 'panel',
        env: 'production',
        region: 'cn-shanghai'
      }
    }
  }
})

/* -------------------------------------------------------------- 优惠券 */

export type CouponType = 'fixed' | 'percent'
export type CouponStatus = 'active' | 'expired' | 'disabled'

export interface Coupon {
  id: string
  code: string
  type: CouponType
  /** 固定金额为元，百分比为折扣百分比 */
  value: number
  used: number
  total: number
  minAmount: string
  expiresAt: string
  status: CouponStatus
  createdAt: string
}

export const couponTypeLabels: Record<CouponType, string> = {
  fixed: '固定金额',
  percent: '百分比'
}

export const coupons: Coupon[] = [
  { id: 'cpn_001', code: 'WELCOME10', type: 'fixed', value: 10, used: 186, total: 500, minAmount: '30.00', expiresAt: iso(30), status: 'active', createdAt: iso(-20) },
  { id: 'cpn_002', code: 'SPRING20', type: 'percent', value: 20, used: 412, total: 1000, minAmount: '50.00', expiresAt: iso(12), status: 'active', createdAt: iso(-12) },
  { id: 'cpn_003', code: 'BLACKFRIDAY', type: 'percent', value: 35, used: 980, total: 1000, minAmount: '100.00', expiresAt: iso(-2), status: 'expired', createdAt: iso(-45) },
  { id: 'cpn_004', code: 'NEWYEAR50', type: 'fixed', value: 50, used: 74, total: 200, minAmount: '200.00', expiresAt: iso(60), status: 'active', createdAt: iso(-6) },
  { id: 'cpn_005', code: 'TESTONLY', type: 'fixed', value: 1, used: 3, total: 10, minAmount: '0.00', expiresAt: iso(3), status: 'disabled', createdAt: iso(-9) },
  { id: 'cpn_006', code: 'TEAM15', type: 'percent', value: 15, used: 0, total: 50, minAmount: '500.00', expiresAt: iso(90), status: 'active', createdAt: iso(-1) }
]

/* -------------------------------------------------------------- 系统设置 */

export const siteSettings = {
  name: 'Sparrow',
  logo: 'https://cdn.example.com/sparrow/logo.svg',
  announcement: '十一假期正常发货，节点线路已完成扩容。遇到问题请提交工单。',
  icp: '沪ICP备2026000000号-1'
}

export const registrationSettings = {
  open: true,
  emailVerify: true,
  giftTrafficGb: 5,
  inviteOnly: false
}

export interface PaymentChannel {
  id: string
  name: string
  enabled: boolean
  mode: string
  summary: string
  fields: Array<{ label: string; value: string }>
}

export const paymentChannels: PaymentChannel[] = [
  {
    id: 'epay',
    name: '易支付',
    enabled: true,
    mode: '生产',
    summary: '商户 PID 1001 · 网关 https://pay.example.com',
    fields: [
      { label: '网关地址', value: 'https://pay.example.com' },
      { label: '商户 PID', value: '1001' },
      { label: '签名方式', value: 'MD5' }
    ]
  },
  {
    id: 'stripe',
    name: 'Stripe',
    enabled: false,
    mode: '测试',
    summary: 'pk_test_*** · webhook 已配置',
    fields: [
      { label: 'Publishable Key', value: 'pk_test_51N***' },
      { label: 'Webhook', value: 'https://panel.example.com/api/v1/pay/stripe' },
      { label: '结算币种', value: 'USD' }
    ]
  }
]

export const emailSettings = {
  host: 'smtp.example.com',
  port: '465',
  username: 'noreply@example.com',
  password: 'demo-smtp-password',
  from: 'Sparrow <noreply@example.com>',
  secure: true
}

export const roleMatrix = [
  {
    role: 'user' as const,
    label: '普通用户',
    description: '仅可访问用户中心，权限点为空',
    permissions: ROLE_PERMISSIONS.user ?? []
  },
  {
    role: 'admin' as const,
    label: '管理员',
    description: '可管理商品、订单、用户与插件，不能卸载插件',
    permissions: ROLE_PERMISSIONS.admin ?? []
  },
  {
    role: 'superadmin' as const,
    label: '超级管理员',
    description: '拥有全部权限，包括插件卸载与角色配置',
    permissions: ['*']
  }
]

export const allPermissionPoints = ALL_PERMISSIONS
