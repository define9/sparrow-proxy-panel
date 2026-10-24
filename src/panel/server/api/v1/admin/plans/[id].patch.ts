import { IdSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { planNodeGroups, plans } from '../../../../../drizzle/schema'
import { requirePermission } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { UpdatePlanSchema, toPlanUpdateValues, toPlanView } from '../../../../utils/plan'
import { validateBody } from '../../../../utils/validate'

/**
 * PATCH /api/v1/admin/plans/{id}
 *
 * 编辑商品：只更新显式提交的字段。
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

  const body = await validateBody(event, UpdatePlanSchema)

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

  if (body.slug && body.slug !== existing.slug) {
    const [duplicated] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.slug, body.slug))
      .limit(1)

    if (duplicated) {
      throw createError({
        statusCode: 422,
        statusMessage: 'VALIDATION_FAILED',
        message: '商品标识（slug）已存在',
        data: { code: 'VALIDATION_FAILED', message: '商品标识（slug）已存在', field: 'slug' }
      })
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(plans)
      .set({ ...toPlanUpdateValues(body), updatedAt: new Date() })
      .where(eq(plans.id, id.data))
      .returning()

    if (body.nodeGroupIds !== undefined) {
      await tx.delete(planNodeGroups).where(eq(planNodeGroups.planId, id.data))
      if (body.nodeGroupIds.length) {
        await tx.insert(planNodeGroups).values(
          body.nodeGroupIds.map(nodeGroupId => ({ planId: id.data, nodeGroupId }))
        )
      }
    }

    return row
  })

  if (!updated) {
    throw createError({
      statusCode: 500,
      statusMessage: 'INTERNAL_ERROR',
      message: '商品更新失败',
      data: { code: 'INTERNAL_ERROR', message: '商品更新失败' }
    })
  }

  return { data: toPlanView(updated) }
})
