import { IdSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq, sql } from 'drizzle-orm'
import { orders, plans } from '../../../../../../drizzle/schema'
import { requirePermission } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import {
  orderQuantity,
  releasePlanStock,
  toOrderView,
  transitionOrderStatus
} from '../../../../../utils/order'

/**
 * POST /api/v1/admin/orders/{id}/refund
 *
 * 退款：paid → refunded，并归还库存、扣减销量。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_ORDER_REFUND)

  const id = IdSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ORDER_NOT_FOUND',
      message: '订单不存在',
      data: { code: 'ORDER_NOT_FOUND', message: '订单不存在' }
    })
  }

  const db = useDb()

  const [existing] = await db.select().from(orders).where(eq(orders.id, id.data)).limit(1)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ORDER_NOT_FOUND',
      message: '订单不存在',
      data: { code: 'ORDER_NOT_FOUND', message: '订单不存在' }
    })
  }

  const updated = await db.transaction(async (tx) => {
    const order = await transitionOrderStatus(tx, existing, 'refunded')

    await releasePlanStock(tx, order.planId, orderQuantity(order))
    await tx
      .update(plans)
      .set({ soldCount: sql`${plans.soldCount} - 1`, updatedAt: new Date() })
      .where(eq(plans.id, order.planId))

    return order
  })

  return { data: toOrderView(updated) }
})
