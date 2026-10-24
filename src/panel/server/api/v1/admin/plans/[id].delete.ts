import { IdSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { orders, plans } from '../../../../../drizzle/schema'
import { requirePermission } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'

/**
 * DELETE /api/v1/admin/plans/{id}
 *
 * 删除商品：已有订单的商品禁止删除（保留历史订单的可追溯性）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLAN_DELETE)

  const id = IdSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) {
    throw createError({
      statusCode: 404,
      statusMessage: 'PLAN_NOT_FOUND',
      message: '商品不存在',
      data: { code: 'PLAN_NOT_FOUND', message: '商品不存在' }
    })
  }

  const db = useDb()

  const [existing] = await db.select().from(plans).where(eq(plans.id, id.data)).limit(1)
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'PLAN_NOT_FOUND',
      message: '商品不存在',
      data: { code: 'PLAN_NOT_FOUND', message: '商品不存在' }
    })
  }

  const [related] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.planId, id.data))
    .limit(1)

  if (related) {
    throw createError({
      statusCode: 409,
      statusMessage: 'VALIDATION_FAILED',
      message: '该商品已有订单，禁止删除',
      data: {
        code: 'VALIDATION_FAILED',
        message: '该商品已有订单，禁止删除',
        reason: 'PLAN_HAS_ORDERS'
      }
    })
  }

  await db.delete(plans).where(eq(plans.id, id.data))

  return { ok: true }
})
