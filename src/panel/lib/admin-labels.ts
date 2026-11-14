import type { Order, Plan, Subscription } from '@sparrow/contracts'
import { siteOrigin } from '@/lib/site-origin'

/**
 * 管理端展示字典。
 * 与 mock/admin-catalog 的区别：这里只放纯字典，不含任何演示数据，
 * 可以安全地被接真实接口的页面引用。
 */

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
  demo: '演示网关',
  manual: '管理员手动',
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

/**
 * 订阅链接：用 siteOrigin()（客户端取浏览器当前 origin，服务端取环境变量）。
 * 直接读 NEXT_PUBLIC_SITE_URL 会在客户端被构建期内联成 localhost —— 详见 lib/site-origin.ts。
 */
export function subscriptionLink(token: string) {
  return `${siteOrigin()}/sub/${token}`
}
