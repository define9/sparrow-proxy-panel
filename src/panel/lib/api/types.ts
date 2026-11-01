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

export interface PayResult {
  orderNo: string
  payUrl: string
  /** 重复支付（订单已 paid）时为 true，不会重复开通订阅 */
  idempotent: boolean
  subscriptionId: string | null
}
