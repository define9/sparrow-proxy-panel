import 'server-only'
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { Plan } from '@sparrow/contracts'
import { ApiError } from '@/lib/api/response'
import type { AdminPlanPatch } from '@/lib/api/commerce-schemas'
import { db } from '@/lib/db'
import { orders, paymentRecords, plans, subscriptions, users } from '@/lib/db/schema'
import { settleOrderAsPaid } from '@/lib/services/billing'

/**
 * 管理端商品 / 订单 / 订阅服务层。
 * 与用户端 billing.ts 分工：这里只做管理视角的查询、批量操作与状态机，
 * 开通订阅复用 billing.ts 的 settleOrderAsPaid，避免两处各写一套。
 */

const GB = 1024 ** 3

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

/* --------------------------------- 商品 ---------------------------------- */

export interface AdminPlanFilters {
  q?: string
  status?: 'draft' | 'active' | 'inactive'
}

export async function listAdminPlans(filters: AdminPlanFilters = {}): Promise<Plan[]> {
  const keyword = filters.q?.trim()
  const conditions = []
  if (filters.status) conditions.push(eq(plans.status, filters.status))
  if (keyword) {
    conditions.push(or(ilike(plans.name, `%${keyword}%`), ilike(plans.slug, `%${keyword}%`)))
  }

  const rows = await db
    .select()
    .from(plans)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(plans.sort), desc(plans.createdAt))

  return rows.map(toPlan)
}

export interface CreateAdminPlanInput {
  name: string
  slug: string
  description: string
  type: 'traffic' | 'time' | 'bandwidth'
  price: string
  originalPrice: string | null
  trafficGb: number
  durationDays: number
  deviceLimit: number
  speedLimitMbps: number
  stock: number | null
  status: 'draft' | 'active' | 'inactive'
  isHot: boolean
  tags: string[]
  sort: number
}

async function assertSlugAvailable(slug: string, exceptId?: string) {
  const [taken] = await db.select({ id: plans.id }).from(plans).where(eq(plans.slug, slug)).limit(1)
  if (taken && taken.id !== exceptId) {
    throw new ApiError(409, 'PLAN_SLUG_TAKEN', '该 slug 已被其他商品占用', { field: 'slug' })
  }
}

export async function createAdminPlan(input: CreateAdminPlanInput): Promise<Plan> {
  await assertSlugAvailable(input.slug)

  const [row] = await db
    .insert(plans)
    .values({
      name: input.name,
      slug: input.slug,
      description: input.description,
      type: input.type,
      price: input.price,
      originalPrice: input.originalPrice,
      trafficGb: input.trafficGb,
      durationDays: input.durationDays,
      deviceLimit: input.deviceLimit,
      speedLimitMbps: input.speedLimitMbps,
      stock: input.stock,
      status: input.status,
      isHot: input.isHot,
      tags: input.tags,
      sort: input.sort
    })
    .returning()

  return toPlan(row)
}

export async function updateAdminPlan(id: string, input: AdminPlanPatch): Promise<Plan> {
  const [current] = await db.select().from(plans).where(eq(plans.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'PLAN_NOT_FOUND', '商品不存在')

  if (input.slug !== undefined && input.slug !== current.slug) {
    await assertSlugAvailable(input.slug, id)
  }

  const patch: Partial<typeof plans.$inferInsert> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name
  if (input.slug !== undefined) patch.slug = input.slug
  if (input.description !== undefined) patch.description = input.description
  if (input.type !== undefined) patch.type = input.type
  if (input.price !== undefined) patch.price = input.price
  if (input.originalPrice !== undefined) patch.originalPrice = input.originalPrice
  if (input.trafficGb !== undefined) patch.trafficGb = input.trafficGb
  if (input.durationDays !== undefined) patch.durationDays = input.durationDays
  if (input.deviceLimit !== undefined) patch.deviceLimit = input.deviceLimit
  if (input.speedLimitMbps !== undefined) patch.speedLimitMbps = input.speedLimitMbps
  if (input.stock !== undefined) patch.stock = input.stock
  if (input.status !== undefined) patch.status = input.status
  if (input.isHot !== undefined) patch.isHot = input.isHot
  if (input.tags !== undefined) patch.tags = input.tags
  if (input.sort !== undefined) patch.sort = input.sort

  const [row] = await db.update(plans).set(patch).where(eq(plans.id, id)).returning()
  if (!row) throw new ApiError(404, 'PLAN_NOT_FOUND', '商品不存在')
  return toPlan(row)
}

export async function deleteAdminPlan(id: string): Promise<void> {
  const [current] = await db.select({ id: plans.id, name: plans.name }).from(plans).where(eq(plans.id, id)).limit(1)
  if (!current) throw new ApiError(404, 'PLAN_NOT_FOUND', '商品不存在')

  // 订单 / 订阅仍引用该商品时不允许物理删除，避免线上数据悬空
  const [[orderRef], [subRef]] = await Promise.all([
    db.select({ total: count() }).from(orders).where(eq(orders.planId, id)),
    db.select({ total: count() }).from(subscriptions).where(eq(subscriptions.planId, id))
  ])
  if (Number(orderRef?.total ?? 0) > 0 || Number(subRef?.total ?? 0) > 0) {
    throw new ApiError(409, 'PLAN_IN_USE', '该商品已产生订单或订阅，请改为下架而不是删除')
  }

  await db.delete(plans).where(eq(plans.id, id))
}

/** 复制一份草稿：slug 依次尝试 `-copy`、`-copy-2`… */
export async function duplicateAdminPlan(id: string): Promise<Plan> {
  const [source] = await db.select().from(plans).where(eq(plans.id, id)).limit(1)
  if (!source) throw new ApiError(404, 'PLAN_NOT_FOUND', '商品不存在')

  const baseSlug = `${source.slug}-copy`
  let slug = baseSlug
  for (let i = 2; i <= 50; i += 1) {
    const [taken] = await db.select({ id: plans.id }).from(plans).where(eq(plans.slug, slug)).limit(1)
    if (!taken) break
    slug = `${baseSlug}-${i}`
    if (i === 50) throw new ApiError(409, 'PLAN_SLUG_TAKEN', '副本 slug 生成失败，请手动创建')
  }

  const [row] = await db
    .insert(plans)
    .values({
      name: `${source.name} 副本`,
      slug,
      description: source.description,
      type: source.type,
      price: source.price,
      originalPrice: source.originalPrice,
      trafficGb: source.trafficGb,
      durationDays: source.durationDays,
      deviceLimit: source.deviceLimit,
      speedLimitMbps: source.speedLimitMbps,
      stock: source.stock,
      soldCount: 0,
      status: 'draft',
      isHot: false,
      tags: source.tags ?? [],
      sort: source.sort
    })
    .returning()

  return toPlan(row)
}

/* --------------------------------- 订单 ---------------------------------- */

export type AdminOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'refunded'

export interface AdminOrderFilters {
  status?: AdminOrderStatus
  q?: string
  page?: number
  pageSize?: number
}

export interface AdminOrderRow {
  id: string
  orderNo: string
  userId: string
  userEmail: string
  planId: string
  planName: string
  amount: string
  discount: string
  status: AdminOrderStatus
  paymentMethod: string | null
  tradeNo: string | null
  expiresAt: string
  paidAt: string | null
  createdAt: string
}

export interface AdminOrderListResult {
  data: AdminOrderRow[]
  total: number
  page: number
  pageSize: number
  counts: Record<'all' | AdminOrderStatus, number>
}

function toOrderRow(row: OrderRow, userEmail: string, planName: string): AdminOrderRow {
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

function orderConditions(filters: { status?: AdminOrderStatus; q?: string }) {
  const conditions = []
  if (filters.status) conditions.push(eq(orders.status, filters.status))
  const keyword = filters.q?.trim()
  if (keyword) {
    conditions.push(
      or(
        ilike(orders.orderNo, `%${keyword}%`),
        ilike(users.email, `%${keyword}%`),
        ilike(plans.name, `%${keyword}%`)
      )
    )
  }
  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function listAdminOrders(filters: AdminOrderFilters = {}): Promise<AdminOrderListResult> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
  const where = orderConditions(filters)

  const rows = await db
    .select({ order: orders, userEmail: users.email, planName: plans.name })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [[totalRow], statusRows] = await Promise.all([
    db
      .select({ total: count() })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .innerJoin(plans, eq(plans.id, orders.planId))
      .where(where),
    db.select({ status: orders.status, total: count() }).from(orders).groupBy(orders.status)
  ])

  const counts: Record<'all' | AdminOrderStatus, number> = {
    all: 0,
    pending: 0,
    paid: 0,
    cancelled: 0,
    expired: 0,
    refunded: 0
  }
  for (const row of statusRows) {
    counts[row.status] = Number(row.total)
    counts.all += Number(row.total)
  }

  return {
    data: rows.map((row) => toOrderRow(row.order, row.userEmail, row.planName)),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
    counts
  }
}

export interface AdminOrderPaymentRecord {
  id: string
  gateway: string
  amount: string
  status: string
  tradeNo: string | null
  createdAt: string
  raw: Record<string, unknown> | null
}

export interface AdminOrderTimelineStep {
  key: string
  title: string
  at: string | null
  done: boolean
}

export interface AdminOrderDetail {
  order: AdminOrderRow
  paymentRecords: AdminOrderPaymentRecord[]
  timeline: AdminOrderTimelineStep[]
  meta: Record<string, unknown> | null
}

function parseRaw(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function buildTimeline(row: OrderRow): AdminOrderTimelineStep[] {
  const createdAt = row.createdAt.toISOString()
  const paidAt = row.paidAt ? row.paidAt.toISOString() : null
  const closed = row.status === 'cancelled' || row.status === 'expired'

  return [
    { key: 'created', title: '创建订单', at: createdAt, done: true },
    {
      key: 'paid',
      title: row.status === 'refunded' ? '支付成功（已退款）' : row.status === 'paid' ? '支付成功' : closed ? '支付关闭' : '等待支付',
      at: paidAt,
      done: row.status === 'paid' || row.status === 'refunded'
    },
    {
      key: 'closed',
      title:
        row.status === 'refunded'
          ? '已退款'
          : row.status === 'cancelled'
            ? '订单取消'
            : row.status === 'expired'
              ? '订单过期'
              : row.status === 'paid'
                ? '订单完成'
                : '待处理',
      at:
        row.status === 'refunded' || row.status === 'cancelled' || row.status === 'expired'
          ? (row.updatedAt?.toISOString?.() ?? paidAt)
          : null,
      done: row.status === 'paid' || row.status === 'refunded' || closed
    }
  ]
}

export async function getAdminOrder(id: string): Promise<AdminOrderDetail> {
  const [row] = await db
    .select({ order: orders, userEmail: users.email, planName: plans.name })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(eq(orders.id, id))
    .limit(1)

  if (!row) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')

  const records = await db
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.orderId, id))
    .orderBy(desc(paymentRecords.createdAt))

  return {
    order: toOrderRow(row.order, row.userEmail, row.planName),
    paymentRecords: records.map((record) => ({
      id: record.id,
      gateway: record.gateway,
      amount: record.amount,
      status: record.status,
      tradeNo: record.tradeNo,
      createdAt: record.createdAt.toISOString(),
      raw: parseRaw(record.raw)
    })),
    timeline: buildTimeline(row.order),
    meta: parseRaw(row.order.meta)
  }
}

/** 手动完成：pending → paid，并开通订阅（复用 billing 的状态机） */
export async function completeAdminOrder(
  id: string,
  options: { note?: string; tradeNo?: string } = {}
): Promise<{ order: AdminOrderDetail; subscriptionId: string | null; idempotent: boolean }> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for('update')
    if (!row) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')

    if (row.status === 'paid') {
      const [existing] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.orderId, row.id))
        .limit(1)
      return { subscriptionId: existing?.id ?? null, idempotent: true }
    }
    if (row.status !== 'pending') {
      throw new ApiError(409, 'ORDER_NOT_PAYABLE', '只有待支付订单可以手动完成')
    }

    const settled = await settleOrderAsPaid(tx, row, 'manual', {
      tradeNo: options.tradeNo,
      raw: { gateway: 'manual', note: options.note ?? null, manual: true, paidAt: new Date().toISOString() }
    })
    return { subscriptionId: settled.subscriptionId, idempotent: false }
  })

  return {
    order: await getAdminOrder(id),
    subscriptionId: result.subscriptionId,
    idempotent: result.idempotent
  }
}

/** 退款：paid → refunded，写支付记录并把订阅置为已取消 */
export async function refundAdminOrder(
  id: string,
  options: { reason?: string } = {}
): Promise<{ order: AdminOrderDetail; cancelledSubscriptions: number }> {
  const cancelledSubscriptions = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1).for('update')
    if (!row) throw new ApiError(404, 'ORDER_NOT_FOUND', '订单不存在')
    if (row.status !== 'paid') {
      throw new ApiError(409, 'ORDER_NOT_REFUNDABLE', '只有已支付订单可以退款')
    }

    const now = new Date()
    await tx.insert(paymentRecords).values({
      orderId: row.id,
      gateway: row.paymentMethod ?? 'manual',
      amount: row.amount,
      status: 'refunded',
      tradeNo: `RF${now.getTime()}`,
      raw: JSON.stringify({ gateway: row.paymentMethod ?? 'manual', reason: options.reason ?? null, refundedAt: now.toISOString() })
    })

    await tx
      .update(orders)
      .set({ status: 'refunded', updatedAt: now })
      .where(eq(orders.id, row.id))

    const cancelled = await tx
      .update(subscriptions)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(subscriptions.orderId, row.id))
      .returning({ id: subscriptions.id })

    return cancelled.length
  })

  return { order: await getAdminOrder(id), cancelledSubscriptions }
}

/* --------------------------------- 订阅 ---------------------------------- */

export interface AdminSubscriptionRow {
  id: string
  token: string
  userId: string
  userEmail: string
  planId: string
  planName: string
  orderId: string | null
  status: 'active' | 'paused' | 'expired' | 'cancelled'
  format: 'v2ray' | 'clash' | 'singbox'
  deviceLimit: number
  speedLimitMbps: number
  trafficLimit: number
  trafficUsed: number
  upload: number
  download: number
  expireAt: string
  createdAt: string
}

export interface AdminSubscriptionFilters {
  q?: string
  status?: AdminSubscriptionRow['status']
  page?: number
  pageSize?: number
}

function toSubscriptionRow(
  row: SubscriptionRow,
  userEmail: string,
  planName: string
): AdminSubscriptionRow {
  return {
    id: row.id,
    token: row.token,
    userId: row.userId,
    userEmail,
    planId: row.planId,
    planName,
    orderId: row.orderId,
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

export async function listAdminSubscriptions(filters: AdminSubscriptionFilters = {}): Promise<{
  data: AdminSubscriptionRow[]
  total: number
  page: number
  pageSize: number
}> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
  const conditions = []
  if (filters.status) conditions.push(eq(subscriptions.status, filters.status))
  const keyword = filters.q?.trim()
  if (keyword) {
    conditions.push(
      or(
        ilike(users.email, `%${keyword}%`),
        ilike(plans.name, `%${keyword}%`),
        ilike(subscriptions.id, `%${keyword}%`),
        ilike(subscriptions.token, `%${keyword}%`)
      )
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({ subscription: subscriptions, userEmail: users.email, planName: plans.name })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(where)
    .orderBy(desc(subscriptions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [totalRow] = await db
    .select({ total: count() })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(where)

  return {
    data: rows.map((row) => toSubscriptionRow(row.subscription, row.userEmail, row.planName)),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize
  }
}

export async function getAdminSubscription(id: string): Promise<AdminSubscriptionRow> {
  const [row] = await db
    .select({ subscription: subscriptions, userEmail: users.email, planName: plans.name })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.id, id))
    .limit(1)

  if (!row) throw new ApiError(404, 'SUB_NOT_FOUND', '订阅不存在')
  return toSubscriptionRow(row.subscription, row.userEmail, row.planName)
}

export async function updateAdminSubscription(
  id: string,
  input: {
    trafficLimit?: number
    deviceLimit?: number
    speedLimitMbps?: number
    expireAt?: string | null
    status?: AdminSubscriptionRow['status']
  }
): Promise<AdminSubscriptionRow> {
  const patch: Partial<typeof subscriptions.$inferInsert> = { updatedAt: new Date() }
  if (input.trafficLimit !== undefined) patch.trafficLimit = String(input.trafficLimit)
  if (input.deviceLimit !== undefined) patch.deviceLimit = input.deviceLimit
  if (input.speedLimitMbps !== undefined) patch.speedLimitMbps = input.speedLimitMbps
  if (input.status !== undefined) patch.status = input.status
  if (input.expireAt !== undefined) {
    if (input.expireAt === null) {
      throw new ApiError(422, 'SUB_EXPIRE_INVALID', '到期时间不能为空')
    }
    const expireAt = new Date(input.expireAt)
    if (Number.isNaN(expireAt.getTime())) {
      throw new ApiError(422, 'SUB_EXPIRE_INVALID', '到期时间格式不正确')
    }
    patch.expireAt = expireAt
  }

  const [row] = await db.update(subscriptions).set(patch).where(eq(subscriptions.id, id)).returning()
  if (!row) throw new ApiError(404, 'SUB_NOT_FOUND', '订阅不存在')

  const [plan] = await db.select({ name: plans.name }).from(plans).where(eq(plans.id, row.planId)).limit(1)
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1)
  return toSubscriptionRow(row, user?.email ?? '', plan?.name ?? '')
}

/**
 * 批量调整：extend 天数 / quota GB / speed Mbps。
 * 事务内逐条更新，路由层负责逐条写审计日志。
 */
export async function batchAdminSubscriptions(input: {
  ids: string[]
  action: 'extend' | 'quota' | 'speed'
  value: number
}): Promise<{ updated: number; ids: string[] }> {
  const now = new Date()

  return db.transaction(async (tx) => {
    if (input.action === 'extend') {
      if (input.value <= 0) throw new ApiError(422, 'SUB_EXTEND_INVALID', '延长天数必须大于 0')
      const rows = await tx
        .update(subscriptions)
        .set({
          // 已过期订阅从当前时间顺延，避免"延长后仍然过期"
          expireAt: sql`greatest(${subscriptions.expireAt}, ${now}) + ${`${input.value} days`}::interval`,
          updatedAt: now
        })
        .where(inArray(subscriptions.id, input.ids))
        .returning({ id: subscriptions.id })
      return { updated: rows.length, ids: rows.map((row) => row.id) }
    }

    if (input.action === 'quota') {
      const rows = await tx
        .update(subscriptions)
        .set({ trafficLimit: String(input.value * GB), updatedAt: now })
        .where(inArray(subscriptions.id, input.ids))
        .returning({ id: subscriptions.id })
      return { updated: rows.length, ids: rows.map((row) => row.id) }
    }

    const rows = await tx
      .update(subscriptions)
      .set({ speedLimitMbps: input.value, updatedAt: now })
      .where(inArray(subscriptions.id, input.ids))
      .returning({ id: subscriptions.id })
    return { updated: rows.length, ids: rows.map((row) => row.id) }
  })
}

/** 单条延长：详情页「延长 30 天」用 */
export async function extendAdminSubscription(id: string, days: number): Promise<AdminSubscriptionRow> {
  const result = await batchAdminSubscriptions({ ids: [id], action: 'extend', value: days })
  if (result.updated === 0) throw new ApiError(404, 'SUB_NOT_FOUND', '订阅不存在')
  return getAdminSubscription(id)
}

/** 订单详情里展示订阅摘要时用 */
export async function orderSubscription(orderId: string) {
  const rows = await db
    .select({ id: subscriptions.id, status: subscriptions.status, token: subscriptions.token })
    .from(subscriptions)
    .where(eq(subscriptions.orderId, orderId))
    .limit(1)
  return rows[0] ?? null
}
