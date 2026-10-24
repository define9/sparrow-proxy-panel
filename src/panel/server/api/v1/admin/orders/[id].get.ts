import { IdSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { orders, plans, users } from '../../../../../drizzle/schema'
import { requirePermission } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { expireStaleOrders, toOrderView } from '../../../../utils/order'

/**
 * GET /api/v1/admin/orders/{id}
 *
 * 订单详情（管理端）：含下单用户邮箱与商品名称。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_ORDER_READ)

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

  const [row] = await db
    .select({ order: orders, planName: plans.name, userEmail: users.email })
    .from(orders)
    .leftJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, id.data))
    .limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'ORDER_NOT_FOUND',
      message: '订单不存在',
      data: { code: 'ORDER_NOT_FOUND', message: '订单不存在' }
    })
  }

  return { data: toOrderView(row.order, { planName: row.planName, userEmail: row.userEmail }) }
})
