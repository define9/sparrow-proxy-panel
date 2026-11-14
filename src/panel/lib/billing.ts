import type { Order, Plan, Subscription } from '@sparrow/contracts'
import { siteOrigin } from '@/lib/site-origin'

/**
 * 商品 / 订单 / 订阅的展示辅助（纯函数，客户端可用）。
 * 数据和接口无关，页面只从这里取文案与派生值，不再依赖 lib/mock。
 */

export const ORDER_STATUS_LABELS: Record<Order['status'], string> = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  expired: '已过期',
  refunded: '已退款'
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  demo: '演示网关',
  epay: '易支付',
  stripe: 'Stripe',
  balance: '账户余额'
}

export function paymentMethodLabel(method: string | null | undefined) {
  if (!method) return '—'
  return PAYMENT_METHOD_LABELS[method] ?? method
}

/** 订单实付金额 = 金额 - 优惠 */
export function orderTotal(order: Pick<Order, 'amount' | 'discount'>) {
  return Number(order.amount) - Number(order.discount)
}

export type SubscriptionFormat = Subscription['format']

export const SUBSCRIPTION_FORMATS: Array<{
  value: SubscriptionFormat
  label: string
  hint: string
}> = [
  { value: 'v2ray', label: 'V2Ray', hint: 'v2rayN / v2rayNG / Shadowrocket' },
  { value: 'clash', label: 'Clash', hint: 'Clash Verge / Mihomo Party' },
  { value: 'singbox', label: 'sing-box', hint: 'sing-box / SFI / SFA' }
]

/**
 * 订阅输出在站点同域的 /sub/{token}，格式通过 ?target= 指定。
 *
 * 用 siteOrigin() 而不是直接读 NEXT_PUBLIC_SITE_URL：后者在客户端组件里
 * 会被构建期内联成 localhost（详见 lib/site-origin.ts 的说明）。
 */
export function subscriptionUrl(token: string, format: SubscriptionFormat) {
  return `${siteOrigin()}/sub/${token}?target=${format}`
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
    description: finished ? '支付完成后自动开通，可在「订阅」页复制链接' : '支付完成后自动开通，无需人工审核',
    time: finished ? order.paidAt : null,
    state: finished ? 'done' : 'pending'
  })

  return steps
}

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
    benefits.push('热销商品：支付后自动开通')
  }

  return benefits
}
