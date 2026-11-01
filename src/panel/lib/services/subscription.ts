import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodes, plans, planNodeGroups, subscriptionNodeGroups, subscriptions } from '@/lib/db/schema'
import type { RenderNode, RenderSubscription } from '@/lib/subscription/render'

export interface SubscriptionDetail extends RenderSubscription {
  id: string
  userId: string
  planId: string
  status: 'active' | 'paused' | 'expired' | 'cancelled'
  format: 'v2ray' | 'clash' | 'singbox'
  deviceLimit: number
  speedLimitMbps: number
  trafficLimit: number
  trafficUsed: number
  upload: number
  download: number
  expireAt: Date
}

/** 订阅 + 套餐名（订阅名直接用套餐名） */
export async function findSubscriptionByToken(token: string): Promise<SubscriptionDetail | null> {
  const [row] = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      token: subscriptions.token,
      status: subscriptions.status,
      format: subscriptions.format,
      deviceLimit: subscriptions.deviceLimit,
      speedLimitMbps: subscriptions.speedLimitMbps,
      trafficLimit: subscriptions.trafficLimit,
      trafficUsed: subscriptions.trafficUsed,
      upload: subscriptions.upload,
      download: subscriptions.download,
      expireAt: subscriptions.expireAt,
      planName: plans.name
    })
    .from(subscriptions)
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.token, token))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    token: row.token,
    name: row.planName ?? 'Sparrow 订阅',
    status: row.status,
    format: row.format,
    deviceLimit: row.deviceLimit,
    speedLimitMbps: row.speedLimitMbps,
    trafficLimit: Number(row.trafficLimit ?? 0),
    trafficUsed: Number(row.trafficUsed ?? 0),
    upload: Number(row.upload ?? 0),
    download: Number(row.download ?? 0),
    expireAt: row.expireAt
  }
}

/**
 * 订阅可见节点：subscription_node_groups 覆盖套餐默认的 plan_node_groups。
 * 两者都未配置时退化为「全部在线节点」（演示站与未分组套餐的默认行为）。
 * 只返回在线节点（离线节点不写入订阅）。
 */
export async function listVisibleNodes(subscription: {
  id: string
  planId: string
}): Promise<RenderNode[]> {
  const overrides = await db
    .select({ groupId: subscriptionNodeGroups.nodeGroupId })
    .from(subscriptionNodeGroups)
    .where(eq(subscriptionNodeGroups.subscriptionId, subscription.id))

  let groupIds = overrides.map((row) => row.groupId)

  if (groupIds.length === 0) {
    const planGroups = await db
      .select({ groupId: planNodeGroups.nodeGroupId })
      .from(planNodeGroups)
      .where(eq(planNodeGroups.planId, subscription.planId))
    groupIds = planGroups.map((row) => row.groupId)
  }

  const where =
    groupIds.length > 0
      ? and(inArray(nodes.groupId, groupIds), eq(nodes.status, 'online'))
      : eq(nodes.status, 'online')

  const rows = await db
    .select({
      id: nodes.id,
      name: nodes.name,
      protocol: nodes.protocol,
      host: nodes.host,
      port: nodes.port,
      network: nodes.network,
      tlsMode: nodes.tlsMode,
      sni: nodes.sni,
      path: nodes.path,
      hostHeader: nodes.hostHeader,
      alpn: nodes.alpn,
      allowInsecure: nodes.allowInsecure,
      realityPublicKey: nodes.realityPublicKey,
      realityShortId: nodes.realityShortId,
      flow: nodes.flow,
      method: nodes.method
    })
    .from(nodes)
    .where(where)
    .orderBy(nodes.sort, nodes.name)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    network: row.network,
    tlsMode: row.tlsMode,
    sni: row.sni,
    path: row.path,
    hostHeader: row.hostHeader,
    alpn: row.alpn,
    allowInsecure: row.allowInsecure,
    realityPublicKey: row.realityPublicKey,
    realityShortId: row.realityShortId,
    flow: row.flow,
    method: row.method
  }))
}

/** 订阅是否还能用：状态 active 且未过期且未超量（不限量时 trafficLimit = 0） */
export function subscriptionAvailability(subscription: SubscriptionDetail) {
  if (subscription.status === 'cancelled') {
    return { usable: false, reason: '订阅已取消，请联系管理员或重新购买。' }
  }
  if (subscription.status === 'paused') {
    return { usable: false, reason: '订阅已暂停，恢复后可继续使用。' }
  }
  if (subscription.status === 'expired' || subscription.expireAt.getTime() <= Date.now()) {
    return { usable: false, reason: '订阅已过期，请续费后重新拉取。' }
  }
  if (subscription.trafficLimit > 0 && subscription.trafficUsed >= subscription.trafficLimit) {
    return { usable: false, reason: '订阅流量已用尽，请购买加油包或升级套餐。' }
  }
  return { usable: true, reason: '' }
}

export function subscriptionUserinfo(subscription: SubscriptionDetail) {
  const expire = Math.floor(subscription.expireAt.getTime() / 1000)
  return [
    `upload=${subscription.upload}`,
    `download=${subscription.download}`,
    `total=${subscription.trafficLimit}`,
    `expire=${expire}`
  ].join('; ')
}
