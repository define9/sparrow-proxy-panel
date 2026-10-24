import { IdSchema, OrderStatusSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { and, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { orders, plans, users } from '../../../../../drizzle/schema'
import { requirePermission } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { expireStaleOrders, parseDateParam, parsePagination, toOrderView } from '../../../../utils/order'

/**
 * GET /api/v1/admin/orders
 *
 * 订单列表（管理端）：按状态 / 用户 / 商品 / 时间范围 / 单号筛选 + 分页。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_ORDER_READ)

  const query = getQuery(event)
  const { page, pageSize } = parsePagination(query as Record<string, unknown>)

  const parsedStatus = OrderStatusSchema.safeParse(query.status)
  const status = parsedStatus.success ? parsedStatus.data : undefined
  const parsedUserId = IdSchema.safeParse(query.userId)
  const userId = parsedUserId.success ? parsedUserId.data : undefined
  const parsedPlanId = IdSchema.safeParse(query.planId)
  const planId = parsedPlanId.success ? parsedPlanId.data : undefined
  const from = parseDateParam(query.from)
  const to = parseDateParam(query.to, { endOfDay: true })
  const keyword = typeof query.q === 'string' ? query.q.trim() : ''

  const db = useDb()

  await expireStaleOrders(db)

  const conditions: SQL[] = []
  if (status) {
    conditions.push(eq(orders.status, status))
  }
  if (userId) {
    conditions.push(eq(orders.userId, userId))
  }
  if (planId) {
    conditions.push(eq(orders.planId, planId))
  }
  if (from) {
    conditions.push(gte(orders.createdAt, from))
  }
  if (to) {
    conditions.push(lte(orders.createdAt, to))
  }
  if (keyword) {
    conditions.push(or(ilike(orders.orderNo, `%${keyword}%`), ilike(users.email, `%${keyword}%`))!)
  }

  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db
    .select({ order: orders, planName: plans.name, userEmail: users.email })
    .from(orders)
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [aggregate] = await db
    .select({ total: count() })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(where)

  const total = aggregate?.total ?? 0

  return {
    data: rows.map(row => toOrderView(row.order, { planName: row.planName, userEmail: row.userEmail })),
    meta: {
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      nextCursor: null
    }
  }
})
