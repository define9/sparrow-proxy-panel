import type { Order, Plan, Subscription } from '@sparrow/contracts'

/**
 * 用户端接口的响应类型（客户端与服务端共用，只含类型，不含 SQL）。
 * 商品 / 订单 / 订阅直接复用 @sparrow/contracts 的结构，接口层保证字段一致。
 */
export type { Order, Plan, Subscription }

export interface AnnouncementView {
  id: string
  title: string
  content: string
  level: 'info' | 'warn' | 'error'
  publishedAt: string
}

export interface OverviewAccount {
  id: string
  username: string
  email: string
  balance: string
}

export interface OverviewQuota {
  used: number
  limit: number
  remaining: number
  percent: number
}

export interface OverviewTraffic {
  todayUsed: number
  monthUsed: number
  upload: number
  download: number
  dailyAverage: number
  estimatedDays: number
}

export interface OverviewData {
  account: OverviewAccount
  subscription: Subscription | null
  quota: OverviewQuota
  devices: { online: number; limit: number }
  traffic: OverviewTraffic
  recentOrders: Order[]
  announcements: AnnouncementView[]
}

export interface TrafficPoint {
  date: string
  upload: number
  download: number
  total: number
}

/* ------------------------------ 个人设置 ------------------------------ */

/** 当前账号资料；不含 password_hash / twofa_secret */
export interface ProfileDto {
  id: string
  username: string
  email: string
  telegramId: string | null
  roleCode: string
  twoFactorEnabled: boolean
  createdAt: string
  lastLoginAt: string | null
}

/** 登录设备；current 标记当前正在使用的会话 */
export interface SessionDto {
  id: string
  ip: string | null
  userAgent: string | null
  current: boolean
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

/** API Token 列表项：只回前缀，不返回 token_hash */
export interface TokenDto {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

/** 创建响应：明文 token 只在这里出现一次 */
export interface TokenCreatedDto extends TokenDto {
  token: string
}

/** 可申请的 PAT 权限范围（服务端与创建表单共用） */
export const TOKEN_SCOPES = [
  'profile:read',
  'subscription:read',
  'traffic:read',
  'orders:read'
] as const

export type TokenScope = (typeof TOKEN_SCOPES)[number]

export type PayMode = 'demo' | 'gateway'

export interface PayResult {
  orderNo: string
  payUrl: string
  /** 重复支付（订单已 paid）时为 true，不会重复开通订阅 */
  idempotent: boolean
  subscriptionId: string | null
  /** demo = 演示网关直接落定；gateway = 已配置渠道（payUrl 仍指向演示支付页） */
  mode: PayMode
  /** mode=gateway 时为渠道 key */
  gateway?: string
}
