import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gte, sql } from 'drizzle-orm'
import type { Order, Plan, Subscription } from '@sparrow/contracts'
import { ApiError } from '@/lib/api/response'
import type {
  AnnouncementView,
  OverviewData,
  PayResult,
  TrafficPoint
} from '@/lib/api/types'
import { db } from '@/lib/db'
import {
  announcements,
  coupons,
  orders,
  paymentRecords,
  planNodeGroups,
  plans,
  subscriptionNodeGroups,
  subscriptions,
  trafficDaily
} from '@/lib/db/schema'

/**
 * 商品 / 订单 / 支付 / 订阅的服务层。
 * 页面与 route handler 都从这里取数据，不直接写 SQL。
 */

const GB = 1024 ** 3
const HOUR = 3_600_000
const DAY = 86_400_000
const ORDER_TTL_HOURS = 2

const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

/* ------------------------------- 行 → DTO -------------------------------- */

type PlanRow = typeof plans.$inferSelect
type OrderRow = typeof orders.$inferSelect
type SubscriptionRow = typeof subscriptions.$inferSelect

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    type: row.type,
    price: row.price,
    originalPrice: row.originalPrice,
    trafficGb: row.trafficGb,
    durationDays: row.durationDays,
    deviceLimit: row.deviceLimit,
    speedLimitMbps: row.speedLimitMbps,
    stock: row.stock,
    soldCount: row.soldCount,
    status: row.status,
    isHot: row.isHot,
    tags: row.tags ?? [],
    sort: row.sort
  }
}

function toOrder(row: OrderRow, planName: string, userEmail: string): Order {
  return {
    id: row.id,
    orderNo: row.orderNo,
    userId: row.userId,
    userEmail,
    planId: row.planId,
    planName,
    amount: row.amount,
    discount: row.discount,
    status: row.status,
    paymentMethod: row.paymentMethod,
    tradeNo: row.tradeNo,
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  }
}

function toSubscription(row: SubscriptionRow, planName: string, userEmail: string): Subscription {
  return {
    id: row.id,
    token: row.token,
    userId: row.userId,
    userEmail,
    planId: row.planId,
    planName,
    status: row.status,
    format: row.format,
    deviceLimit: row.deviceLimit,
    speedLimitMbps: row.speedLimitMbps,
    trafficLimit: Number(row.trafficLimit),
    trafficUsed: Number(row.trafficUsed),
    upload: Number(row.upload),
    download: Number(row.download),
    expireAt: row.expireAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  }
}

/* --------------------------------- 商品 ---------------------------------- */

export async function listPublicPlans(): Promise<Plan[]> {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.status, 'active'))
    .orderBy(asc(plans.sort), asc(plans.createdAt))

  return rows.map(toPlan)
}

/** 用户端商品列表：只暴露在售商品，草稿/下架不进列表 */
export async function listUserPlans(): Promise<Plan[]> {
  return listPublicPlans()
}

export async function getPlan(id: string): Promise<Plan> {
  const [row] = await db.select().from(plans).where(eq(plans.id, id)).limit(1)
  if (!row) throw new ApiError(404, 'PLAN_NOT_FOUND', '商品不存在或已下架')
  return toPlan(row)
}

/* --------------------------------- 订单 ---------------------------------- */

export interface OrderListFilters {
  status?: 'pending' | 'paid' | 'cancelled' | 'expired' | 'refunded'
  page?: number
  pageSize?: number
}

export async function listUserOrders(
  userId: string,
  email: string,
  filters: OrderListFilters = {}
): Promise<{ data: Order[]; total: number; page: number; pageSize: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 20
  const where = filters.status
    ? and(eq(orders.userId, userId), eq(orders.status, filters.status))
    : eq(orders.userId, userId)

  const rows = await db
    .select({ order: orders, planName: plans.name })
    .from(orders)
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [{ value: total }] = await db.select({ value: count() }).from(orders).where(where)

  return {
    data: rows.map((row) => toOrder(row.order, row.planName, email)),
    total: Number(total),
    page,
    pageSize
  }
}

export async function getUserOrder(
  userId: string,
  email: string,
  orderNo: string
): Promise<Order> {
  const [row] = await db
    .select({ order: orders, planName: plans.name })
    .from(orders)
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(and(eq(orders.userId, userId), eq(orders.orderNo, orderNo)))
    .limit(1)

  // 非本人订单一律 404，避免通过状态码探测他人订单是否存在
  if (!row) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
  return toOrder(row.order, row.planName, email)
}

export interface CreateOrderInput {
  planId: string
  couponCode?: string
}

async function nextOrderNo(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const orderNo = `SP${String(randomInt(0, 100_000_000)).padStart(8, '0')}`
    const [hit] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNo, orderNo))
      .limit(1)
    if (!hit) return orderNo
  }
  throw new ApiError(500, 'ORDER_NO_EXHAUSTED', '订单号生成失败，请重试')
}

export async function createOrder(
  userId: string,
  email: string,
  input: CreateOrderInput
): Promise<Order> {
  const orderNo = await nextOrderNo()

  return db.transaction(async (tx) => {
    // 锁商品行：并发下单时库存不会超卖
    const [plan] = await tx
      .select()
      .from(plans)
      .where(eq(plans.id, input.planId))
      .limit(1)
      .for('update')

    if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', '商品不存在')
    if (plan.status !== 'active') throw new ApiError(422, 'PLAN_INACTIVE', '商品已下架')
    if (plan.stock !== null && plan.stock <= 0) {
      throw new ApiError(422, 'PLAN_OUT_OF_STOCK', '商品库存不足')
    }

    const price = Number(plan.price)
    let discount = 0

    if (input.couponCode) {
      const code = input.couponCode.trim().toUpperCase()
      const [coupon] = await tx
        .select()
        .from(coupons)
        .where(sql`upper(${coupons.code}) = ${code}`)
        .limit(1)

      if (!coupon || !coupon.enabled) {
        throw new ApiError(422, 'COUPON_INVALID', '优惠码不可用', { field: 'couponCode' })
      }
      if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
        throw new ApiError(422, 'COUPON_EXPIRED', '优惠码已过期', { field: 'couponCode' })
      }
      if (coupon.quota > 0 && coupon.usedCount >= coupon.quota) {
        throw new ApiError(422, 'COUPON_EXHAUSTED', '优惠码已用完', { field: 'couponCode' })
      }
      if (price < Number(coupon.minAmount)) {
        throw new ApiError(422, 'COUPON_MIN_AMOUNT', '未达到优惠码使用门槛', {
          field: 'couponCode'
        })
      }

      const value = Number(coupon.value)
      const raw = coupon.type === 'percent' ? (price * Math.min(value, 100)) / 100 : value
      discount = Math.min(Math.max(raw, 0), price)

      await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(eq(coupons.id, coupon.id))
    }

    const amount = Math.max(price - discount, 0)
    const now = new Date()

    const [row] = await tx
      .insert(orders)
      .values({
        orderNo,
        userId,
        planId: plan.id,
        amount: amount.toFixed(2),
        discount: discount.toFixed(2),
        status: 'pending',
        expiresAt: new Date(now.getTime() + ORDER_TTL_HOURS * HOUR),
        meta: JSON.stringify({ planName: plan.name, price: plan.price })
      })
      .returning()

    if (plan.stock !== null) {
      await tx
        .update(plans)
        .set({ stock: sql`${plans.stock} - 1`, updatedAt: now })
        .where(eq(plans.id, plan.id))
    }

    return toOrder(row, plan.name, email)
  })
}

export async function cancelOrder(userId: string, email: string, orderNo: string): Promise<Order> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ order: orders, planName: plans.name })
      .from(orders)
      .innerJoin(plans, eq(plans.id, orders.planId))
      .where(and(eq(orders.userId, userId), eq(orders.orderNo, orderNo)))
      .limit(1)
      .for('update')

    if (!row) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
    if (row.order.status === 'paid') {
      throw new ApiError(409, 'ORDER_ALREADY_PAID', '订单已支付，无法取消')
    }
    if (row.order.status !== 'pending') {
      throw new ApiError(409, 'ORDER_NOT_CANCELLABLE', '当前订单状态不可取消')
    }
    if (row.order.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(422, 'ORDER_EXPIRED', '订单已超时，无法取消')
    }

    const now = new Date()
    const [updated] = await tx
      .update(orders)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(orders.id, row.order.id))
      .returning()

    // 释放下单时预占的库存
    await tx
      .update(plans)
      .set({ stock: sql`${plans.stock} + 1`, updatedAt: now })
      .where(and(eq(plans.id, row.order.planId), sql`${plans.stock} is not null`))

    return toOrder(updated, row.planName, email)
  })
}

function payUrl(orderNo: string) {
  return `${SITE_ORIGIN}/dashboard/orders/${orderNo}`
}

/**
 * 内置演示网关：不做真实扣费，直接落支付记录、置 paid、开订阅。
 * 已 paid 的订单重复调用直接返回成功，不重复开通。
 */
export async function payOrder(userId: string, orderNo: string): Promise<PayResult> {
  const [pre] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.orderNo, orderNo)))
    .limit(1)

  if (!pre) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')

  if (pre.status === 'paid') {
    const [existing] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.orderId, pre.id))
      .limit(1)

    return {
      orderNo,
      payUrl: payUrl(orderNo),
      idempotent: true,
      subscriptionId: existing?.id ?? null
    }
  }

  if (pre.status !== 'pending') {
    throw new ApiError(409, 'ORDER_NOT_PAYABLE', '当前订单状态不可支付')
  }

  if (pre.expiresAt.getTime() <= Date.now()) {
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(orders.id, pre.id))
      await tx
        .update(plans)
        .set({ stock: sql`${plans.stock} + 1` })
        .where(and(eq(plans.id, pre.planId), sql`${plans.stock} is not null`))
    })
    throw new ApiError(422, 'ORDER_EXPIRED', '订单已超时，请重新下单')
  }

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, pre.id)).limit(1).for('update')
    if (!row) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')

    // 并发重复支付：拿到锁后重新判断
    if (row.status === 'paid') {
      const [existing] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.orderId, row.id))
        .limit(1)
      return {
        orderNo,
        payUrl: payUrl(orderNo),
        idempotent: true,
        subscriptionId: existing?.id ?? null
      }
    }
    if (row.status !== 'pending') {
      throw new ApiError(409, 'ORDER_NOT_PAYABLE', '当前订单状态不可支付')
    }

    const settled = await settleOrderAsPaid(tx, row, 'demo')

    return {
      orderNo,
      payUrl: payUrl(orderNo),
      idempotent: false,
      subscriptionId: settled.subscriptionId
    }
  })
}

/* ------------------------ 订单落定（支付/手动完成共用） ------------------------ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface SettleOrderOptions {
  tradeNo?: string
  raw?: Record<string, unknown>
}

/**
 * 订单 pending → paid，并开通订阅。
 * 调用方负责事务边界与订单行锁（检测并发重复支付）。
 * 演示网关与管理端「手动完成」共用这一段开通逻辑，避免两处状态机漂移。
 */
export async function settleOrderAsPaid(
  tx: Tx,
  order: OrderRow,
  gateway: string,
  options: SettleOrderOptions = {}
): Promise<{ subscriptionId: string; tradeNo: string }> {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, order.planId)).limit(1)
  if (!plan) throw new ApiError(404, 'PLAN_NOT_FOUND', '商品不存在')

  const now = new Date()
  const tradeNo = options.tradeNo ?? `${gateway.toUpperCase()}${now.getTime()}${randomInt(1000, 9999)}`

  await tx.insert(paymentRecords).values({
    orderId: order.id,
    gateway,
    amount: order.amount,
    status: 'success',
    tradeNo,
    raw: JSON.stringify(
      options.raw ?? { gateway, tradeNo, paidAt: now.toISOString() }
    )
  })

  await tx
    .update(orders)
    .set({
      status: 'paid',
      paidAt: now,
      paymentMethod: gateway,
      tradeNo,
      updatedAt: now
    })
    .where(eq(orders.id, order.id))

  await tx
    .update(plans)
    .set({ soldCount: sql`${plans.soldCount} + 1`, updatedAt: now })
    .where(eq(plans.id, plan.id))

  const trafficLimit = plan.trafficGb > 0 ? String(plan.trafficGb * GB) : '0'

  const [subscription] = await tx
    .insert(subscriptions)
    .values({
      userId: order.userId,
      planId: plan.id,
      orderId: order.id,
      token: randomUUID(),
      format: 'clash',
      status: 'active',
      deviceLimit: plan.deviceLimit,
      speedLimitMbps: plan.speedLimitMbps,
      trafficLimit,
      expireAt: new Date(now.getTime() + plan.durationDays * DAY)
    })
    .returning({ id: subscriptions.id })

  // 复制商品可用的节点组，订阅输出时直接用
  const groups = await tx
    .select({ nodeGroupId: planNodeGroups.nodeGroupId })
    .from(planNodeGroups)
    .where(eq(planNodeGroups.planId, plan.id))

  if (groups.length > 0) {
    await tx
      .insert(subscriptionNodeGroups)
      .values(groups.map((group) => ({ subscriptionId: subscription.id, nodeGroupId: group.nodeGroupId })))
  }

  return { subscriptionId: subscription.id, tradeNo }
}

/* --------------------------------- 订阅 ---------------------------------- */

export async function listUserSubscriptions(
  userId: string,
  email: string
): Promise<Subscription[]> {
  const rows = await db
    .select({ subscription: subscriptions, planName: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))

  return rows.map((row) => toSubscription(row.subscription, row.planName, email))
}

export async function getUserSubscription(
  userId: string,
  email: string,
  id: string
): Promise<Subscription> {
  const [row] = await db
    .select({ subscription: subscriptions, planName: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.id, id)))
    .limit(1)

  if (!row) throw new ApiError(404, 'SUB_NOT_FOUND', '订阅不存在')
  return toSubscription(row.subscription, row.planName, email)
}

/** 只允许改渲染格式与设备数；其余字段忽略 */
export async function updateUserSubscription(
  userId: string,
  email: string,
  id: string,
  input: { format?: 'v2ray' | 'clash' | 'singbox'; deviceLimit?: number }
): Promise<Subscription> {
  const patch: Partial<typeof subscriptions.$inferInsert> = { updatedAt: new Date() }
  if (input.format !== undefined) patch.format = input.format
  if (input.deviceLimit !== undefined) patch.deviceLimit = input.deviceLimit

  const [row] = await db
    .update(subscriptions)
    .set(patch)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.id, id)))
    .returning()

  if (!row) throw new ApiError(404, 'SUB_NOT_FOUND', '订阅不存在')

  const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, row.planId)).limit(1)
  return toSubscription(row, plan?.name ?? '', email)
}

/* -------------------------------- 概览 ----------------------------------- */

async function currentSubscription(userId: string, email: string) {
  const [active] = await db
    .select({ subscription: subscriptions, planName: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
    .orderBy(desc(subscriptions.expireAt))
    .limit(1)

  if (active) return toSubscription(active.subscription, active.planName, email)

  const [latest] = await db
    .select({ subscription: subscriptions, planName: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  return latest ? toSubscription(latest.subscription, latest.planName, email) : null
}

function rangeStart(range: '7d' | '30d' | '90d') {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
  const start = new Date(Date.now() - (days - 1) * DAY)
  start.setUTCHours(0, 0, 0, 0)
  return start.toISOString().slice(0, 10)
}

export async function listTraffic(userId: string, range: '7d' | '30d' | '90d' = '30d'): Promise<TrafficPoint[]> {
  const rows = await db
    .select()
    .from(trafficDaily)
    .where(and(eq(trafficDaily.userId, userId), gte(trafficDaily.date, rangeStart(range))))
    .orderBy(asc(trafficDaily.date))

  return rows.map((row) => ({
    date: row.date,
    upload: Number(row.upload),
    download: Number(row.download),
    total: Number(row.total)
  }))
}

export async function getOverview(
  userId: string,
  email: string,
  username: string,
  balance: string
): Promise<OverviewData> {
  const subscription = await currentSubscription(userId, email)
  const points = await listTraffic(userId, '30d')

  const upload = points.reduce((sum, point) => sum + point.upload, 0)
  const download = points.reduce((sum, point) => sum + point.download, 0)
  const monthFromLogs = upload + download
  const monthUsed = monthFromLogs > 0 ? monthFromLogs : (subscription?.trafficUsed ?? 0)
  const todayUsed = points[points.length - 1]?.total ?? 0

  const limit = subscription?.trafficLimit ?? 0
  const used = subscription?.trafficUsed ?? 0
  const remaining = limit > 0 ? Math.max(limit - used, 0) : 0
  const dailyAverage = Math.round(monthUsed / 30)
  const estimatedDays = limit > 0 && dailyAverage > 0 ? Math.floor(remaining / dailyAverage) : 0

  const [recentRows, announcementRows] = await Promise.all([
    db
      .select({ order: orders, planName: plans.name })
      .from(orders)
      .innerJoin(plans, eq(plans.id, orders.planId))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(3),
    db
      .select()
      .from(announcements)
      .where(eq(announcements.status, 'published'))
      .orderBy(desc(announcements.publishedAt))
      .limit(3)
  ])

  const announcementList: AnnouncementView[] = announcementRows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    level: row.level,
    publishedAt: row.publishedAt.toISOString()
  }))

  return {
    account: { id: userId, username, email, balance },
    subscription,
    quota: {
      used,
      limit,
      remaining,
      percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
    },
    // 在线设备由节点侧上报，面板暂无明细，先用设备上限占位
    devices: { online: 0, limit: subscription?.deviceLimit ?? 0 },
    traffic: {
      todayUsed,
      monthUsed,
      upload: subscription?.upload ?? upload,
      download: subscription?.download ?? download,
      dailyAverage,
      estimatedDays
    },
    recentOrders: recentRows.map((row) => toOrder(row.order, row.planName, email)),
    announcements: announcementList
  }
}
