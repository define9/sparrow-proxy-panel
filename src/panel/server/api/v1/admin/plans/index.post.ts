import { UpsertPlanSchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { planNodeGroups, plans } from '../../../../../drizzle/schema'
import { requirePermission } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { toPlanInsertValues, toPlanView } from '../../../../utils/plan'
import { validateBody } from '../../../../utils/validate'

/**
 * POST /api/v1/admin/plans
 *
 * 创建商品（默认 draft 草稿，需显式上架才对外可见）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLAN_WRITE)

  const body = await validateBody(event, UpsertPlanSchema)

  const db = useDb()

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

  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(plans).values(toPlanInsertValues(body)).returning()

    if (!row) {
      throw createError({
        statusCode: 500,
        statusMessage: 'INTERNAL_ERROR',
        message: '商品创建失败',
        data: { code: 'INTERNAL_ERROR', message: '商品创建失败' }
      })
    }

    if (body.nodeGroupIds.length) {
      await tx.insert(planNodeGroups).values(
        body.nodeGroupIds.map(nodeGroupId => ({ planId: row.id, nodeGroupId }))
      )
    }

    return row
  })

  return { data: toPlanView(created) }
})
