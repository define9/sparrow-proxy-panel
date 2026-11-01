import type { Order, Plan, Subscription } from '@sparrow/contracts'
import { iso } from './util'
import { nodeGroups, nodes, orders, subscriptions, trafficSeries } from './catalog'

/**
 * 用户视角的演示数据：当前账号、订阅、设备、Token、按节点流量等。
 * 全部为确定性数据，不接后端；页面只读。
 */

/** 演示用的「现在」——与 catalog 的时间锚点保持一致，避免渲染结果随真实时间漂移 */
export const DEMO_NOW = iso(0)

/** 相对演示时间锚点计算剩余天数（负数表示已过期） */
export function demoDaysLeft(value: string) {
  return Math.ceil((new Date(value).getTime() - new Date(DEMO_NOW).getTime()) / 86_400_000)
}

export const account = {
  id: 'usr_00000001',
  username: 'admin',
  email: 'admin@example.com',
  nickname: 'Alex',
  bio: '自建节点重度用户，主要在香港与东京之间切换。',
  telegram: '@alex_sparrow',
  balance: '128.00',
  role: '超级管理员',
  registeredAt: iso(-420),
  lastLoginAt: iso(0, -0.2),
  twoFactorEnabled: false,
  emailVerified: true,
  language: 'zh-CN',
  timezone: 'Asia/Shanghai'
}

/** 当前生效的订阅（列表页第一条） */
export const currentSubscription: Subscription = subscriptions[0]

/** 全部演示订单按时间倒序，第一条即最近一笔 */
export const recentOrders: Order[] = [...orders]
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  .slice(0, 3)

/* ---------------------------------- 流量 ---------------------------------- */

/** 把全站流量曲线缩放到当前订阅的用量口径，保证图表与配额一致 */
const seriesTotal = trafficSeries.reduce((sum, item) => sum + item.total, 0)
const seriesScale = currentSubscription.trafficLimit > 0 ? currentSubscription.trafficUsed / seriesTotal : 0

export const userTrafficSeries = trafficSeries.map((item) => ({
  date: item.date,
  upload: Math.round(item.upload * seriesScale),
  download: Math.round(item.download * seriesScale),
  total: Math.round(item.total * seriesScale)
}))

const seriesUpload = userTrafficSeries.reduce((sum, item) => sum + item.upload, 0)
const seriesDownload = userTrafficSeries.reduce((sum, item) => sum + item.download, 0)
const seriesUsed = seriesUpload + seriesDownload
const latestDay = userTrafficSeries[userTrafficSeries.length - 1]

export const trafficSummary = {
  monthUsed: seriesUsed,
  todayUsed: latestDay?.total ?? 0,
  upload: seriesUpload,
  download: seriesDownload,
  limit: currentSubscription.trafficLimit,
  remaining: Math.max(currentSubscription.trafficLimit - seriesUsed, 0),
  /** 近 30 天平均每日用量 */
  dailyAverage: Math.round(seriesUsed / userTrafficSeries.length),
  /** 按当前日均用量估算可用天数 */
  estimatedDays: Math.max(
    Math.floor(
      (currentSubscription.trafficLimit - seriesUsed) / Math.max(seriesUsed / userTrafficSeries.length, 1)
    ),
    0
  )
}

const nodeShares = [0.21, 0.17, 0.14, 0.12, 0.1, 0.08, 0.06, 0.05]

/** 按节点聚合的近 30 天流量（演示值，按固定占比拆分） */
export const nodeTrafficTop = nodes
  .map((node, index) => {
    const share = nodeShares[index] ?? 0.03
    const total = Math.round(seriesUsed * share)
    return {
      id: node.id,
      name: node.name,
      groupName: node.groupName,
      region: nodeGroups.find((group) => group.id === node.groupId)?.region ?? node.groupName,
      status: node.status,
      upload: Math.round(total * 0.29),
      download: Math.round(total * 0.71),
      total
    }
  })
  .sort((a, b) => b.total - a.total)

/** 节点组 + 组内节点统计，用于订阅详情的可用线路列表 */
export const nodeGroupSummaries = nodeGroups.map((group) => {
  const members = nodes.filter((node) => node.groupId === group.id)
  return {
    ...group,
    nodeCount: members.length,
    onlineCount: members.filter((node) => node.status === 'online').length,
    protocols: [...new Set(members.map((node) => node.protocol))]
  }
})

/* ---------------------------------- 设备 ---------------------------------- */

export const devices = [
  {
    id: 'dev_1',
    name: 'MacBook Pro 14"',
    platform: 'macOS 15.2',
    client: 'Clash Verge 2.1.0',
    ip: '203.0.113.24',
    lastSeenAt: iso(0, -0.05),
    current: true
  },
  {
    id: 'dev_2',
    name: 'iPhone 16 Pro',
    platform: 'iOS 19.1',
    client: 'sing-box 1.10.2',
    ip: '198.51.100.77',
    lastSeenAt: iso(0, -2),
    current: false
  },
  {
    id: 'dev_3',
    name: 'Windows 台式机',
    platform: 'Windows 11 24H2',
    client: 'v2rayN 7.4.2',
    ip: '192.0.2.15',
    lastSeenAt: iso(-1, -3),
    current: false
  }
]

/* --------------------------------- Token --------------------------------- */

export const apiTokens = [
  {
    id: 'tok_1',
    name: 'CI 部署脚本',
    prefix: 'spx_9f2c…a41d',
    scopes: ['subscription:read'],
    createdAt: iso(-40),
    lastUsedAt: iso(0, -3)
  },
  {
    id: 'tok_2',
    name: '监控探针',
    prefix: 'spx_31ab…7e02',
    scopes: ['traffic:read', 'node:read'],
    createdAt: iso(-12),
    lastUsedAt: iso(0, -1)
  },
  {
    id: 'tok_3',
    name: '个人脚本',
    prefix: 'spx_c40e…1f88',
    scopes: ['*'],
    createdAt: iso(-3),
    lastUsedAt: null
  }
]

/* ------------------------------- 订阅链接 -------------------------------- */

export const SUBSCRIPTION_ORIGIN = 'https://sub.sparrow.example'

export type SubscriptionFormat = Subscription['format']

export const SUBSCRIPTION_FORMATS: Array<{ value: SubscriptionFormat; label: string; hint: string }> = [
  { value: 'v2ray', label: 'V2Ray', hint: 'v2rayN / v2rayNG / Shadowrocket' },
  { value: 'clash', label: 'Clash', hint: 'Clash Verge / Mihomo Party' },
  { value: 'singbox', label: 'sing-box', hint: 'sing-box / SFI / SFA' }
]

export function subscriptionUrl(token: string, format: SubscriptionFormat) {
  return `${SUBSCRIPTION_ORIGIN}/sub/${token}?target=${format}`
}

/* --------------------------------- 订单 ---------------------------------- */

export const ORDER_STATUS_LABELS: Record<Order['status'], string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  expired: '已过期',
  refunded: '已退款'
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  epay: '易支付',
  stripe: 'Stripe',
  balance: '账户余额'
}

export function paymentMethodLabel(method: string | null) {
  if (!method) return '—'
  return PAYMENT_METHOD_LABELS[method] ?? method
}

/** 订单实付金额 = 金额 - 优惠 */
export function orderTotal(order: Order) {
  return Number(order.amount) - Number(order.discount)
}

export interface TimelineStep {
  key: string
  title: string
  description: string
  time: string | null
  state: 'done' | 'current' | 'pending'
}

/** 订单时间线（自绘 ol/li 用，不引第三方） */
export function orderTimeline(order: Order): TimelineStep[] {
  const steps: TimelineStep[] = [
    {
      key: 'created',
      title: '创建订单',
      description: `下单商品：${order.planName}`,
      time: order.createdAt,
      state: 'done'
    }
  ]

  if (order.status === 'paid' || order.status === 'refunded') {
    steps.push({
      key: 'paid',
      title: '支付成功',
      description: `${paymentMethodLabel(order.paymentMethod)} · ${order.tradeNo ?? '—'}`,
      time: order.paidAt,
      state: 'done'
    })
  }

  if (order.status === 'pending') {
    steps.push({
      key: 'waiting',
      title: '等待支付',
      description: '订单将在到期时间前保留，超时自动关闭',
      time: order.expiresAt,
      state: 'current'
    })
  }

  if (order.status === 'cancelled') {
    steps.push({
      key: 'cancelled',
      title: '订单已取消',
      description: '订单已关闭，未产生任何扣费',
      time: order.createdAt,
      state: 'done'
    })
  }

  if (order.status === 'expired') {
    steps.push({
      key: 'expired',
      title: '订单已超时',
      description: '超过支付时限，系统自动关闭订单',
      time: order.expiresAt,
      state: 'done'
    })
  }

  if (order.status === 'refunded') {
    steps.push({
      key: 'refunded',
      title: '已退款',
      description: '款项退回原支付渠道，1-3 个工作日到账',
      time: order.paidAt,
      state: 'done'
    })
  }

  const finished = order.status === 'paid' || order.status === 'refunded'
  steps.push({
    key: 'subscription',
    title: finished ? '订阅已开通' : '开通订阅',
    description: finished ? `订阅已绑定到 ${order.userEmail}` : '支付完成后自动开通，无需人工审核',
    time: finished ? order.paidAt : null,
    state: finished ? 'done' : 'pending'
  })

  return steps
}

/* -------------------------------- 商品权益 ------------------------------- */

/** 商品详情页的权益清单：由商品字段推导 + 通用权益 */
export function planBenefits(plan: Plan) {
  const benefits = [
    plan.trafficGb > 0 ? `每周期 ${plan.trafficGb} GB 流量，用尽后自动暂停不扣费` : '不计量流量，仅受节点带宽限制',
    `${plan.deviceLimit} 台设备可同时在线`,
    plan.speedLimitMbps > 0 ? `峰值带宽 ${plan.speedLimitMbps} Mbps` : '不限速，跟随节点带宽',
    '全量节点组可用，支持 v2ray / Clash / sing-box 三种订阅格式',
    '一键导入客户端，支持自动更新订阅',
    '工单 7×24 小时响应，平均 20 分钟内答复'
  ]

  if (plan.durationDays >= 365) {
    benefits.push('年付套餐赠送 30 天，到期前 7 天提醒续费')
  }
  if (plan.isHot) {
    benefits.push('热销商品：支付后 10 秒内自动开通')
  }

  return benefits
}
