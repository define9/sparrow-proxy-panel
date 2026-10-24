import type { Subscription } from '@sparrow/contracts'
import { asc, eq, inArray } from 'drizzle-orm'
import {
  nodes as nodesTable,
  planNodeGroups,
  plans,
  subscriptionNodeGroups,
  subscriptions as subscriptionsTable
} from '../../../drizzle/schema'
import type { Database } from '../db'
import type { RenderNode } from './types'

/**
 * 订阅相关的数据库读取与 DTO 映射。
 *
 * 这里是订阅模块里**唯一**访问数据库的地方，渲染器保持纯函数。
 */

/** subscriptions 表的行类型 */
export type SubscriptionRow = typeof subscriptionsTable.$inferSelect

/** 数据库行 → 契约 Subscription */
export function toSubscriptionDto(row: SubscriptionRow, planName?: string | null): Subscription {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    planName: planName ?? null,
    orderId: row.orderId,
    token: row.token,
    format: row.format,
    status: row.status,
    deviceLimit: row.deviceLimit,
    speedLimitMbps: row.speedLimitMbps,
    trafficLimit: row.trafficLimit,
    trafficUsed: row.trafficUsed,
    upload: row.upload,
    download: row.download,
    expireAt: row.expireAt ? row.expireAt.toISOString() : null,
    resetAt: row.resetAt ? row.resetAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  }
}

/** 数据库行 → 渲染器输入 */
export function toRenderNode(row: typeof nodesTable.$inferSelect): RenderNode {
  return {
    name: row.name,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    network: row.network,
    path: row.path,
    hostHeader: row.hostHeader,
    method: row.method,
    flow: row.flow,
    password: row.password,
    uuid: row.uuid,
    security: row.security,
    tlsMode: row.tlsMode,
    sni: row.sni,
    alpn: row.alpn ?? [],
    allowInsecure: row.allowInsecure,
    realityPublicKey: row.realityPublicKey,
    realityShortId: row.realityShortId,
    fingerprint: row.fingerprint,
    trafficRate: Number(row.trafficRate),
    priority: row.priority,
    weight: row.weight
  }
}

/** 按 token 取订阅 */
export async function findSubscriptionByToken(db: Database, token: string) {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.token, token))
    .limit(1)

  return row ?? null
}

/** 按 id 取订阅 */
export async function findSubscriptionById(db: Database, id: string) {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, id))
    .limit(1)

  return row ?? null
}

/**
 * 取出「属于该用户」的订阅。
 *
 * 对象级权限：不属于当前用户的订阅一律按「不存在」处理，不泄露其存在性。
 */
export async function requireOwnedSubscription(db: Database, userId: string, id: string) {
  const row = await findSubscriptionById(db, id)

  if (!row || row.userId !== userId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'SUB_NOT_FOUND',
      message: '订阅不存在',
      data: { code: 'SUB_NOT_FOUND', message: '订阅不存在' }
    })
  }

  return row
}

/** 取商品（含流量重置日等策略） */
export async function findPlan(db: Database, planId: string) {
  const [row] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1)

  return row ?? null
}

/**
 * 订阅可见的节点组：商品默认节点组 ∪ 管理员为该订阅单独配置的节点组。
 */
export async function findVisibleNodeGroupIds(db: Database, subscription: { id: string, planId: string }): Promise<string[]> {
  const [fromPlan, fromSubscription] = await Promise.all([
    db
      .select({ groupId: planNodeGroups.nodeGroupId })
      .from(planNodeGroups)
      .where(eq(planNodeGroups.planId, subscription.planId)),
    db
      .select({ groupId: subscriptionNodeGroups.nodeGroupId })
      .from(subscriptionNodeGroups)
      .where(eq(subscriptionNodeGroups.subscriptionId, subscription.id))
  ])

  const ids = new Set<string>()
  for (const row of fromPlan) {
    ids.add(row.groupId)
  }
  for (const row of fromSubscription) {
    ids.add(row.groupId)
  }

  return [...ids]
}

/**
 * 载入订阅可见的节点（已按展示顺序排序）。
 *
 * 维护中的节点不下发；其余节点按 sort、name 排序。
 */
export async function loadSubscriptionNodes(db: Database, subscription: { id: string, planId: string }): Promise<RenderNode[]> {
  const groupIds = await findVisibleNodeGroupIds(db, subscription)
  if (groupIds.length === 0) {
    return []
  }

  const rows = await db
    .select()
    .from(nodesTable)
    .where(inArray(nodesTable.groupId, groupIds))
    .orderBy(asc(nodesTable.sort), asc(nodesTable.name))

  return rows
    .filter(row => row.status !== 'maintenance')
    .map(row => toRenderNode(row))
}
