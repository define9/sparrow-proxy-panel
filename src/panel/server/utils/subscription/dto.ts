import type { H3Event } from 'h3'
import type { QuotaState, Subscription } from '@sparrow/contracts'
import { eq } from 'drizzle-orm'
import { plans, settings } from '../../../drizzle/schema'
import { evaluateQuota } from '../quota'
import type { Database } from '../db'
import { type SubscriptionRow, loadSubscriptionNodes, toSubscriptionDto } from './loader'

/**
 * 订阅接口的 DTO 与共享工具。
 */

/** 订阅详情（含各格式链接、配额与白名单） */
export interface SubscriptionDetail extends Subscription {
  /** 配额状态（server/utils/quota.ts） */
  quota: QuotaState
  /** 各格式的订阅链接 */
  urls: SubscriptionUrls
  /** IP 白名单 */
  ipWhitelist: string[]
  /** 可用节点数量 */
  nodeCount: number
}

/** 各格式订阅链接 */
export interface SubscriptionUrls {
  v2ray: string
  clash: string
  singbox: string
}

/**
 * 站点根地址：优先用配置的 siteUrl，其次用当前请求的 origin。
 */
export function resolveBaseUrl(event: H3Event): string {
  const config = useRuntimeConfig(event)
  const configured = config.public.siteUrl

  if (typeof configured === 'string' && configured.length > 0) {
    return configured.replace(/\/+$/, '')
  }

  return getRequestURL(event).origin
}

/**
 * 构造各格式的订阅链接。
 *
 * 链接里只出现 token（uuid v4），不暴露订阅内部主键。
 */
export function buildSubscriptionUrls(baseUrl: string, token: string): SubscriptionUrls {
  return {
    v2ray: `${baseUrl}/sub/${token}?format=v2ray`,
    clash: `${baseUrl}/sub/${token}?format=clash`,
    singbox: `${baseUrl}/sub/${token}?format=singbox`
  }
}

/** IP 白名单在设置表里的键 */
function ipWhitelistKey(subscriptionId: string): string {
  return `subscription:${subscriptionId}:ipWhitelist`
}

/** 设备记录在设置表里的键 */
function devicesKey(subscriptionId: string): string {
  return `subscription:${subscriptionId}:devices`
}

/**
 * 清空设备记录。
 *
 * 面板目前没有独立的设备表，设备记录（内核侧的在线设备、并发连接等）
 * 由 Agent / 内核维护；面板侧只保留一份用于展示与审计的设备快照，
 * 这里把它清掉，真正的断连由内核在收到配置重载后完成。
 */
export async function clearDeviceRecords(db: Database, subscriptionId: string): Promise<number> {
  const key = devicesKey(subscriptionId)

  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  const count = Array.isArray(row?.value) ? row.value.length : 0

  await db.delete(settings).where(eq(settings.key, key))

  return count
}

/** 读取 IP 白名单 */
export async function readIpWhitelist(db: Database, subscriptionId: string): Promise<string[]> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, ipWhitelistKey(subscriptionId)))
    .limit(1)

  const value = row?.value
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

/** 写入 IP 白名单 */
export async function writeIpWhitelist(db: Database, subscriptionId: string, list: string[]): Promise<void> {
  const key = ipWhitelistKey(subscriptionId)

  await db
    .insert(settings)
    .values({ key, value: list })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: list, updatedAt: new Date() }
    })
}

/**
 * 组装订阅详情：契约字段 + 配额 + 各格式链接 + 白名单 + 节点数。
 */
export async function buildSubscriptionDetail(
  db: Database,
  event: H3Event,
  subscription: SubscriptionRow
): Promise<SubscriptionDetail> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1)

  const quota = evaluateQuota({
    status: subscription.status,
    trafficLimit: subscription.trafficLimit,
    trafficUsed: subscription.trafficUsed,
    expireAt: subscription.expireAt
  })

  const nodes = await loadSubscriptionNodes(db, subscription)
  const ipWhitelist = await readIpWhitelist(db, subscription.id)

  return {
    ...toSubscriptionDto(subscription, plan?.name),
    quota,
    urls: buildSubscriptionUrls(resolveBaseUrl(event), subscription.token),
    ipWhitelist,
    nodeCount: nodes.length
  }
}
