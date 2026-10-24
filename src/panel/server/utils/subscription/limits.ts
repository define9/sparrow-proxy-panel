import type { QuotaState } from '@sparrow/contracts'
import { UNLIMITED_BYTES, evaluateQuota } from '../quota'
import type { RenderNode, RenderSubscription } from './types'

/**
 * 订阅配额 → 节点参数的换算（纯函数）。
 *
 * 换算规则：
 * - **限速**：订阅的 `speedLimitMbps`（Mbps）换算成 bps；0 表示不限速
 * - **流量倍率**：节点的 `trafficRate` 表示「走该节点消耗的流量倍数」，
 *   订阅剩余流量需要除以倍率才是该节点侧的可用配额
 */

/** 1 Mbps = 1_000_000 bit/s */
export const MBPS_TO_BPS = 1_000_000

/** 流量倍率归一化：非法值（<= 0 / NaN）视为 1 */
export function normalizeTrafficRate(rate: number | null | undefined): number {
  const value = Number(rate)
  if (!Number.isFinite(value) || value <= 0) {
    return 1
  }
  return value
}

/** Mbps → bps；不限速返回 0 */
export function mbpsToBps(mbps: number): number {
  const value = Number(mbps)
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.round(value * MBPS_TO_BPS)
}

/** Mbps → 字节/秒 */
export function mbpsToBytesPerSecond(mbps: number): number {
  return Math.floor(mbpsToBps(mbps) / 8)
}

/** 倍率的展示文本（1 → "1"，1.5 → "1.5"） */
export function formatTrafficRate(rate: number): string {
  const value = normalizeTrafficRate(rate)
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

/**
 * 节点展示名。
 *
 * 名称后缀只带流量倍率（`[2x]`），客户端一眼能看出计费倍率。
 */
export function formatNodeLabel(name: string, trafficRate: number): string {
  const rate = normalizeTrafficRate(trafficRate)
  return rate === 1 ? name : `${name} [${formatTrafficRate(rate)}x]`
}

/**
 * 配额换算：用户侧剩余字节按节点倍率折算成节点侧可用字节。
 *
 * 例：订阅还剩 10GB，节点倍率 2 → 该节点实际还能跑 5GB。
 */
export function quotaBytesForRate(remaining: number, trafficRate: number): number {
  const rate = normalizeTrafficRate(trafficRate)
  if (remaining >= UNLIMITED_BYTES) {
    return UNLIMITED_BYTES
  }
  return Math.floor(Math.max(0, remaining) / rate)
}

/**
 * 节点是否具备渲染成订阅链接的必要凭据。
 *
 * 缺少凭据的节点会被跳过（渲染出不可用的链接比不下发更糟）。
 */
export function hasRequiredCredentials(node: RenderNode): boolean {
  switch (node.protocol) {
    case 'vmess':
    case 'vless':
      return Boolean(node.uuid)
    case 'trojan':
    case 'shadowsocks':
    case 'hysteria2':
      return Boolean(node.password)
    case 'tuic':
      return Boolean(node.uuid && node.password)
    default:
      return true
  }
}

/** 单个节点的渲染上下文 */
export interface NodeProfile {
  /** 原始节点 */
  node: RenderNode
  /** 展示名（含倍率后缀） */
  label: string
  /** 归一化后的流量倍率 */
  trafficRate: number
  /** 订阅限速（Mbps），0 = 不限 */
  speedLimitMbps: number
  /** 订阅限速换算出的下行速率（bps），0 = 不限 */
  downloadBps: number
  /** 订阅限速换算出的上行速率（bps），0 = 不限 */
  uploadBps: number
  /** 订阅配额状态（来自 server/utils/quota.ts，唯一真理） */
  quota: QuotaState
  /** 按倍率折算后的节点侧可用配额（字节） */
  quotaBytes: number
  /** 是否启用 TLS（tls / reality） */
  tls: boolean
  /** 是否启用 REALITY */
  reality: boolean
  /** 证书校验使用的服务器名（sni 优先，回落 host） */
  serverName: string
}

/**
 * 构造节点渲染上下文：把订阅的配额 / 限速与节点的倍率合并成一份参数。
 *
 * 渲染器只允许通过本函数获取换算结果，避免各处重复实现。
 */
export function buildNodeProfile(subscription: RenderSubscription, node: RenderNode): NodeProfile {
  const quota = evaluateQuota({
    status: subscription.status,
    trafficLimit: subscription.trafficLimit,
    trafficUsed: subscription.trafficUsed,
    expireAt: subscription.expireAt
  })

  const trafficRate = normalizeTrafficRate(node.trafficRate)
  const speedLimitMbps = Number(subscription.speedLimitMbps) > 0 ? Number(subscription.speedLimitMbps) : 0

  return {
    node,
    label: formatNodeLabel(node.name, trafficRate),
    trafficRate,
    speedLimitMbps,
    downloadBps: mbpsToBps(speedLimitMbps),
    uploadBps: mbpsToBps(speedLimitMbps),
    quota,
    quotaBytes: quotaBytesForRate(quota.remainingBytes, trafficRate),
    tls: node.tlsMode === 'tls' || node.tlsMode === 'reality',
    reality: node.tlsMode === 'reality',
    serverName: node.sni || node.host
  }
}
