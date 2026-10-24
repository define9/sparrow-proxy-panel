import type { QuotaState, SubscriptionStatus } from '@sparrow/contracts'

/**
 * 订阅配额判定（唯一真理）。
 *
 * 任何需要判断「订阅还能不能用 / 还剩多少流量」的地方都必须调用本文件，
 * 禁止在接口、渲染器或前端复写判定逻辑。
 *
 * 本模块是纯函数：不访问数据库，时间通过 `now` 注入，便于单测。
 */

/** 配额输入（与数据库字段一一对应） */
export interface QuotaInput {
  /** 订阅状态（active / paused / expired / cancelled） */
  status?: SubscriptionStatus | string
  /** 流量上限（字节），0 表示不限 */
  trafficLimit: number
  /** 已用流量（字节） */
  trafficUsed: number
  /** 到期时间，null / undefined 表示永不过期 */
  expireAt?: Date | string | null
  /** 当前时间（测试可注入） */
  now?: Date
}

/** 不限流量时的剩余字节哨兵值 */
export const UNLIMITED_BYTES = Number.MAX_SAFE_INTEGER

/** 到期时间是否已到（含边界：到期时刻即视为过期） */
export function isExpired(expireAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (expireAt === null || expireAt === undefined) {
    return false
  }

  const timestamp = expireAt instanceof Date ? expireAt.getTime() : new Date(expireAt).getTime()
  if (Number.isNaN(timestamp)) {
    return false
  }

  return timestamp <= now.getTime()
}

/** 流量是否用尽（trafficLimit = 0 表示不限，永远不算超量） */
export function isOverused(trafficLimit: number, trafficUsed: number): boolean {
  const limit = Number(trafficLimit)
  if (!Number.isFinite(limit) || limit <= 0) {
    return false
  }

  return Number(trafficUsed) >= limit
}

/** 剩余流量（字节）；不限流量时返回 UNLIMITED_BYTES */
export function remainingBytes(trafficLimit: number, trafficUsed: number): number {
  const limit = Number(trafficLimit)
  if (!Number.isFinite(limit) || limit <= 0) {
    return UNLIMITED_BYTES
  }

  return Math.max(0, Math.floor(limit - Math.max(0, Number(trafficUsed) || 0)))
}

/** 已用比例（0 ~ 1）；不限流量时为 0 */
export function usedRatio(trafficLimit: number, trafficUsed: number): number {
  const limit = Number(trafficLimit)
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0
  }

  const ratio = Math.max(0, Number(trafficUsed) || 0) / limit
  return Math.min(1, Math.round(ratio * 1e6) / 1e6)
}

/**
 * 汇总配额状态。
 *
 * - `expired`：到期时间已过，或订阅状态本身是 expired
 * - `overused`：流量用尽
 * - `allowed`：未过期、未超量，且订阅不是暂停/取消状态
 */
export function evaluateQuota(input: QuotaInput): QuotaState {
  const { status, trafficLimit, trafficUsed, expireAt, now = new Date() } = input

  const expired = isExpired(expireAt, now) || status === 'expired'
  const overused = isOverused(trafficLimit, trafficUsed)
  const inactive = status === 'paused' || status === 'cancelled'

  return {
    allowed: !expired && !overused && !inactive,
    expired,
    overused,
    remainingBytes: remainingBytes(trafficLimit, trafficUsed),
    usedRatio: usedRatio(trafficLimit, trafficUsed)
  }
}

/** 流量是否无限（trafficLimit = 0） */
export function isUnlimited(trafficLimit: number): boolean {
  const limit = Number(trafficLimit)
  return !Number.isFinite(limit) || limit <= 0
}

/**
 * 下次流量重置时间。
 *
 * `resetDay` 为商品的重置日（1-28，null 表示每月 1 号），
 * 返回 `from` 之后最近的一次重置时刻（UTC 零点）。
 */
export function nextResetAt(resetDay: number | null | undefined, from: Date = new Date()): Date {
  const day = resetDay && resetDay >= 1 && resetDay <= 28 ? Math.floor(resetDay) : 1
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day, 0, 0, 0, 0))

  if (next.getTime() <= from.getTime()) {
    next.setUTCMonth(next.getUTCMonth() + 1)
  }

  return next
}

/**
 * 是否到了可以手动重置流量的时间。
 *
 * 规则：`resetAt` 为空（从未重置）或已到期（自动重置窗口已到）时才允许，
 * 保证一个计费周期内只能手动重置一次。
 */
export function canResetTraffic(resetAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (resetAt === null || resetAt === undefined) {
    return true
  }

  const timestamp = resetAt instanceof Date ? resetAt.getTime() : new Date(resetAt).getTime()
  if (Number.isNaN(timestamp)) {
    return true
  }

  return timestamp <= now.getTime()
}
