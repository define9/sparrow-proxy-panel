import { IdSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq, sql } from 'drizzle-orm'
import { orders, plans } from '../../../../../../drizzle/schema'
import { requirePermission } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { expireStaleOrders, toOrderView, transitionOrderStatus } from '../../../../../utils/order'

/**
 * POST /api/v1/admin/orders/{id}/complete
 *
 * 管理端手动完成订单：pending → paid。
 *
 * TODO：订阅开通尚未实现——本接口只把订单置为已支付，
 * 「根据订单开通订阅（subscriptions）」由订阅模块接管，
 * 当前返回 `todo` 字段说明待补齐的部分，不做任何订阅写入。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_ORDER_WRITE)

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

  await expireStaleOrders(db)

  const [existing] = await db.select().from(orders).where(eq(orders.id, id.data)).limit(1)
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
      message: '订单已是已支付状态',
      data: { code: 'ORDER_ALREADY_PAID', message: '订单已是已支付状态' }
    })
  }

  const paidAt = new Date()

  const updated = await db.transaction(async (tx) => {
    const order = await transitionOrderStatus(tx, existing, 'paid', { paidAt })

    await tx
      .update(plans)
      .set({ soldCount: sql`${plans.soldCount} + 1`, updatedAt: new Date() })
      .where(eq(plans.id, order.planId))

    return order
  })

  return {
    data: toOrderView(updated),
    todo: {
      subscription: '订阅开通尚未实现：待订阅模块接管后，由订单 paid 事件创建 subscriptions 记录'
    }
  }
})
