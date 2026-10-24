import { and, eq } from 'drizzle-orm'
import { orders, plans } from '../../../../../drizzle/schema'
import { useDb } from '../../../../utils/db'
import { expireStaleOrders, toOrderView } from '../../../../utils/order'
import { requireSessionUser } from '../../../../utils/session-user'

/**
 * GET /api/v1/user/orders/{orderNo}
 *
 * 订单详情：只允许查看自己的订单。
 */
export default defineEventHandler(async (event) => {
  const user = await requireSessionUser(event)
  const orderNo = getRouterParam(event, 'orderNo') ?? ''

  const db = useDb()

  await expireStaleOrders(db, { userId: user.id })

  const [row] = await db
    .select({ order: orders, planName: plans.name })
    .from(orders)
    .leftJoin(plans, eq(orders.planId, plans.id))
    .where(and(eq(orders.orderNo, orderNo), eq(orders.userId, user.id)))
    .limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ORDER_NOT_FOUND',
      message: '订单不存在',
      data: { code: 'ORDER_NOT_FOUND', message: '订单不存在' }
    })
  }

  return { data: toOrderView(row.order, { planName: row.planName }) }
})
