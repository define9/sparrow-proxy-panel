import { and, eq } from 'drizzle-orm'
import { orders, plans } from '../../../../../../drizzle/schema'
import { useDb } from '../../../../../utils/db'
import {
  expireStaleOrders,
  orderQuantity,
  releasePlanStock,
  toOrderView,
  transitionOrderStatus
} from '../../../../../utils/order'
import { requireSessionUser } from '../../../../../utils/session-user'

/**
 * POST /api/v1/user/orders/{orderNo}/cancel
 *
 * 取消待支付订单：pending → cancelled，并释放锁定的库存。
 * 已支付 / 已取消 / 已过期 / 已退款的订单拒绝取消（状态机拦截）。
 */
export default defineEventHandler(async (event) => {
  const user = await requireSessionUser(event)
  const orderNo = getRouterParam(event, 'orderNo') ?? ''

  const db = useDb()

  await expireStaleOrders(db, { userId: user.id })

  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNo, orderNo), eq(orders.userId, user.id)))
    .limit(1)

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ORDER_NOT_FOUND',
      message: '订单不存在',
      data: { code: 'ORDER_NOT_FOUND', message: '订单不存在' }
    })
  }

  if (existing.status === 'paid') {
    throw createError({
      statusCode: 409,
      statusMessage: 'ORDER_ALREADY_PAID',
      message: '订单已支付，无法取消',
      data: { code: 'ORDER_ALREADY_PAID', message: '订单已支付，无法取消' }
    })
  }

  const updated = await db.transaction(async (tx) => {
    const order = await transitionOrderStatus(tx, existing, 'cancelled')
    await releasePlanStock(tx, order.planId, orderQuantity(order))
    return order
  })

  const [row] = await db
    .select({ planName: plans.name })
    .from(plans)
    .where(eq(plans.id, updated.planId))
    .limit(1)

  return { data: toOrderView(updated, { planName: row?.planName ?? null }) }
})
