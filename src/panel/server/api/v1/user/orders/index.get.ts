import { OrderStatusSchema } from '@sparrow/contracts'
import { and, count, desc, eq } from 'drizzle-orm'
import { orders, plans } from '../../../../../drizzle/schema'
import { useDb } from '../../../../utils/db'
import { expireStaleOrders, parsePagination, toOrderView } from '../../../../utils/order'
import { requireSessionUser } from '../../../../utils/session-user'

/**
 * GET /api/v1/user/orders
 *
 * 当前登录用户的订单列表：分页 + 状态筛选（按创建时间倒序）。
 */
export default defineEventHandler(async (event) => {
  const user = await requireSessionUser(event)

  const query = getQuery(event)
  const { page, pageSize } = parsePagination(query as Record<string, unknown>)
  const parsedStatus = OrderStatusSchema.safeParse(query.status)
  const status = parsedStatus.success ? parsedStatus.data : undefined

  const db = useDb()

  // 读取前先关闭过期的待支付订单，保证状态真实
  await expireStaleOrders(db, { userId: user.id })

  const conditions = [eq(orders.userId, user.id)]
  if (status) {
    conditions.push(eq(orders.status, status))
  }

  const rows = await db
    .select({ order: orders, planName: plans.name })
    .from(orders)
    .leftJoin(plans, eq(orders.planId, plans.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [aggregate] = await db
    .select({ total: count() })
    .from(orders)
    .where(and(...conditions))

  const total = aggregate?.total ?? 0

  return {
    data: rows.map(row => toOrderView(row.order, { planName: row.planName })),
    meta: {
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      nextCursor: null
    }
  }
})
