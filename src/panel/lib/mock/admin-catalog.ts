import type { Order, Plan, Subscription } from '@sparrow/contracts'
import { trafficSeries } from './catalog'

/**
 * 管理端演示用的派生数据与展示字典。
 * 全部由 lib/mock/catalog.ts 的共享数据推导，刷新后结果不变。
 */

export interface RevenuePoint {
  date: string
  label: string
  revenue: number
  orders: number
}

/** 近 14 天收入：按当日流量折算，周末略高 */
export const revenueSeries: RevenuePoint[] = trafficSeries.slice(-14).map((point) => {
  const gb = point.total / 1024 ** 3
  const day = new Date(`${point.date}T00:00:00.000Z`).getUTCDay()
  const weekendBoost = day === 0 || day === 6 ? 640 : 0
  return {
    date: point.date,
    label: point.date.slice(5).replace('-', '/'),
    revenue: Math.round((gb * 14 + 520 + weekendBoost) * 100) / 100,
    orders: Math.max(4, Math.round(gb / 8))
  }
})

/** 近 14 天收入合计 */
export const revenueTotal = revenueSeries.reduce((sum, point) => sum + point.revenue, 0)

export const planTypeLabels: Record<Plan['type'], string> = {
  traffic: '按流量',
  time: '按时长',
  bandwidth: '按带宽'
}

export const planStatusLabels: Record<Plan['status'], string> = {
  active: '在售',
  draft: '草稿',
  inactive: '已下架'
}

export const orderStatusLabels: Record<Order['status'], string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  expired: '已过期',
  refunded: '已退款'
}

export const paymentMethodLabels: Record<string, string> = {
  epay: '易支付',
  stripe: 'Stripe',
  balance: '余额支付'
}

export function paymentMethodLabel(method: string | null | undefined) {
  if (!method) return '—'
  return paymentMethodLabels[method] ?? method
}

export const subscriptionFormatLabels: Record<Subscription['format'], string> = {
  v2ray: 'V2Ray',
  clash: 'Clash',
  singbox: 'sing-box'
}

/** 订阅链接（演示用固定域名，避免服务端/客户端渲染不一致） */
export function subscriptionLink(token: string) {
  return `https://panel.example.com/sub/${token}`
}
