import type { Order, Plan, Subscription } from '@sparrow/contracts'

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

/** 订阅链接：优先用站点域名，避免部署后仍显示演示域名 */
export function subscriptionLink(token: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return `${origin}/sub/${token}`
}
