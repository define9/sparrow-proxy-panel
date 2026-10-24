import { IdSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { plans } from '../../../../../../drizzle/schema'
import { requirePermission } from '../../../../../utils/auth'
import { useDb } from '../../../../../utils/db'
import { PlanStatusBodySchema, toPlanView } from '../../../../../utils/plan'
import { validateBody } from '../../../../../utils/validate'

/**
 * POST /api/v1/admin/plans/{id}/status
 *
 * 上架 / 下架：draft ↔ active ↔ inactive。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLAN_WRITE)

  const id = IdSchema.safeParse(getRouterParam(event, 'id'))
  if (!id.success) {
    throw createError({
      statusCode: 404,
      statusMessage: 'PLAN_NOT_FOUND',
      message: '商品不存在',
      data: { code: 'PLAN_NOT_FOUND', message: '商品不存在' }
    })
  }

  const body = await validateBody(event, PlanStatusBodySchema)

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

  if (existing.status === body.status) {
    return { data: toPlanView(existing) }
  }

  const [updated] = await db
    .update(plans)
    .set({ status: body.status, updatedAt: new Date() })
    .where(eq(plans.id, id.data))
    .returning()

  if (!updated) {
    throw createError({
      statusCode: 500,
      statusMessage: 'INTERNAL_ERROR',
      message: '商品状态更新失败',
      data: { code: 'INTERNAL_ERROR', message: '商品状态更新失败' }
    })
  }

  return { data: toPlanView(updated) }
})
