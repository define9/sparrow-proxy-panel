import type { OrderStatus } from '@sparrow/contracts'
import { and, eq, sql } from 'drizzle-orm'
import { orders, plans } from '../../drizzle/schema'
import type { Database } from './db'

/**
 * 订单领域逻辑：状态机、单号生成、库存与金额工具。
 *
 * 状态机是唯一的跃迁入口（`assertOrderTransition`），
 * 写操作必须经由 `transitionOrderStatus`，避免每个接口各写一套判定。
 */

/** 允许的订单状态跃迁：pending → paid / cancelled / expired；paid → refunded */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  pending: ['paid', 'cancelled', 'expired'],
  paid: ['refunded'],
  cancelled: [],
  expired: [],
  refunded: []
})

/** 未支付订单自动关闭时间（分钟） */
export const ORDER_EXPIRY_MINUTES = 30

/** 数据库连接或事务（写操作需要在事务内调用时传 tx） */
export type OrderExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

/** 订单行（drizzle 推断） */
export type OrderRow = typeof orders.$inferSelect

/**
 * 订单视图。
 *
 * 与契约 `Order` 对齐，额外补充两个便利字段：
 * - `updatedAt`：列表排序与后台展示需要
 * - `userEmail`：管理端按用户筛选时直接展示（用户端接口不联表，恒为 null）
 */
export interface OrderView {
  id: string
  orderNo: string
  userId: string
  planId: string
  planName: string
  amount: string
  discount: string
  currency: string
  status: OrderStatus
  paymentMethod: string | null
  tradeNo: string | null
  expiresAt: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
  userEmail: string | null
}

/** 跃迁是否合法 */
export function canOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

/**
 * 断言跃迁合法，非法跃迁直接抛 409 ORDER_STATUS_INVALID。
 *
 * 状态机只允许：pending → paid / cancelled / expired，paid → refunded。
 */
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canOrderTransition(from, to)) {
    const message = `订单状态不能从 ${from} 变更为 ${to}`
    throw createError({
      statusCode: 409,
      statusMessage: 'ORDER_STATUS_INVALID',
      message,
      data: { code: 'ORDER_STATUS_INVALID', message, from, to }
    })
  }
}

/**
 * 生成对外单号：`SP` + UTC 时间戳（yyyyMMddHHmmss）+ 8 位随机 hex。
 *
 * 长度 24，满足 `orders.order_no varchar(32)`；时间前缀便于人工排查与按时间检索。
 */
export function generateOrderNo(now: Date = new Date()): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  const stamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds())
  ].join('')
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 8)
  return `SP${stamp}${random}`
}

/** 金额字符串 → 分（整数运算，避免浮点误差） */
export function moneyToCents(value: string): number {
  const normalized = value.trim()
  const negative = normalized.startsWith('-')
  const abs = negative ? normalized.slice(1) : normalized
  const [intPart = '0', fracPart = ''] = abs.split('.')
  const cents = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2))
  return negative ? -cents : cents
}

/** 分 → 金额字符串（两位小数） */
export function centsToMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** 订单购买数量（快照里的 quantity，缺省 1） */
export function orderQuantity(order: Pick<OrderRow, 'meta'>): number {
  const quantity = order.meta?.quantity
  return typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0 ? quantity : 1
}

/** 数据库行 → 视图对象 */
export function toOrderView(
  row: OrderRow,
  extra?: { planName?: string | null, userEmail?: string | null }
): OrderView {
  const snapshotName = typeof row.meta?.planName === 'string' ? row.meta.planName : ''

  return {
    id: row.id,
    orderNo: row.orderNo,
    userId: row.userId,
    planId: row.planId,
    planName: extra?.planName ?? snapshotName,
    amount: row.amount,
    discount: row.discount,
    currency: row.currency,
    status: row.status,
    paymentMethod: row.paymentMethod,
    tradeNo: row.tradeNo,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    userEmail: extra?.userEmail ?? null
  }
}

/**
 * 占用库存：原子扣减，避免并发超卖。
 *
 * `plans.stock` 为 null 表示不限库存，此时不做扣减但依然放行。
 */
export async function reservePlanStock(
  executor: OrderExecutor,
  planId: string,
  quantity: number
): Promise<boolean> {
  const updated = await executor
    .update(plans)
    .set({ stock: sql`${plans.stock} - ${quantity}`, updatedAt: new Date() })
    .where(and(
      eq(plans.id, planId),
      sql`(${plans.stock} is null or ${plans.stock} >= ${quantity})`
    ))
    .returning({ id: plans.id })

  return updated.length > 0
}

/** 释放库存（下单取消 / 过期 / 退款） */
export async function releasePlanStock(
  executor: OrderExecutor,
  planId: string,
  quantity: number
): Promise<void> {
  await executor
    .update(plans)
    .set({ stock: sql`${plans.stock} + ${quantity}`, updatedAt: new Date() })
    .where(eq(plans.id, planId))
}

/**
 * 执行状态跃迁。
 *
 * 用 `where status = 当前状态` 做乐观并发控制：若并发请求已改过状态，
 * 这里会更新不到行，从而拒绝本次跃迁。
 */
export async function transitionOrderStatus(
  executor: OrderExecutor,
  order: Pick<OrderRow, 'id' | 'status'>,
  to: OrderStatus,
  patch: Partial<typeof orders.$inferInsert> = {}
): Promise<OrderRow> {
  assertOrderTransition(order.status, to)

  const [updated] = await executor
    .update(orders)
    .set({ status: to, updatedAt: new Date(), ...patch })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning()

  if (!updated) {
    const message = '订单状态已被其他操作变更，请刷新后重试'
    throw createError({
      statusCode: 409,
      statusMessage: 'ORDER_STATUS_INVALID',
      message,
      data: { code: 'ORDER_STATUS_INVALID', message, from: order.status, to }
    })
  }

  return updated
}

/**
 * 批量把过期的待支付订单置为 expired，并释放库存。
 *
 * 在读取订单列表 / 详情前调用，保证用户看到的是真实状态。
 */
export async function expireStaleOrders(
  executor: OrderExecutor,
  options: { userId?: string } = {}
): Promise<number> {
  const now = new Date()
  const conditions = [
    eq(orders.status, 'pending'),
    sql`${orders.expiresAt} is not null`,
    sql`${orders.expiresAt} <= ${now}`
  ]

  if (options.userId) {
    conditions.push(eq(orders.userId, options.userId))
  }

  const expired = await executor
    .update(orders)
    .set({ status: 'expired', updatedAt: now })
    .where(and(...conditions))
    .returning()

  for (const order of expired) {
    await releasePlanStock(executor, order.planId, orderQuantity(order))
  }

  return expired.length
}

/**
 * 解析列表分页参数（page / pageSize）。
 *
 * 越界或非法一律 422 VALIDATION_FAILED；pageSize 上限 100，禁止无上限拉取。
 */
export function parsePagination(raw: Record<string, unknown>): { page: number, pageSize: number } {
  const parse = (value: unknown, fallback: number, max: number) => {
    if (value === undefined || value === null || value === '') {
      return fallback
    }
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
      throw createError({
        statusCode: 422,
        statusMessage: 'VALIDATION_FAILED',
        message: '分页参数非法',
        data: { code: 'VALIDATION_FAILED', message: '分页参数非法' }
      })
    }
    return parsed
  }

  return {
    page: parse(raw.page, 1, 100_000),
    pageSize: parse(raw.pageSize, 20, 100)
  }
}

/**
 * 解析时间范围参数（from / to）。
 *
 * 接受 ISO 8601 字符串或 `YYYY-MM-DD`；非法值一律 422 VALIDATION_FAILED。
 * `endOfDay` 用于区间上界：只给日期时取当天 23:59:59.999。
 */
export function parseDateParam(
  value: unknown,
  options: { endOfDay?: boolean } = {}
): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value !== 'string') {
    throw createError({
      statusCode: 422,
      statusMessage: 'VALIDATION_FAILED',
      message: '时间范围参数非法',
      data: { code: 'VALIDATION_FAILED', message: '时间范围参数非法' }
    })
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw createError({
      statusCode: 422,
      statusMessage: 'VALIDATION_FAILED',
      message: '时间范围参数非法',
      data: { code: 'VALIDATION_FAILED', message: '时间范围参数非法' }
    })
  }

  if (options.endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed.setUTCHours(23, 59, 59, 999)
  }

  return parsed
}

/** 订单是否已过期（待支付且超过有效期） */
export function isOrderExpired(order: Pick<OrderRow, 'status' | 'expiresAt'>, now: Date = new Date()): boolean {
  return order.status === 'pending' && !!order.expiresAt && order.expiresAt.getTime() <= now.getTime()
}
