import { IdSchema } from '@sparrow/contracts'
import { and, eq } from 'drizzle-orm'
import { plans } from '../../../../../drizzle/schema'
import { useDb } from '../../../../utils/db'
import { toPlanView } from '../../../../utils/plan'
import { requireSessionUser } from '../../../../utils/session-user'

/**
 * GET /api/v1/user/plans/{id}
 *
 * 商品详情：仅已上架（status = active）的商品对用户可见。
 */
export default defineEventHandler(async (event) => {
  await requireSessionUser(event)

  const id = getRouterParam(event, 'id')
  const parsed = IdSchema.safeParse(id)

  if (!parsed.success) {
    throw createError({
      statusCode: 404,
      statusMessage: 'PLAN_NOT_FOUND',
      message: '商品不存在',
      data: { code: 'PLAN_NOT_FOUND', message: '商品不存在' }
    })
  }

  const db = useDb()

  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, parsed.data), eq(plans.status, 'active')))
    .limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'PLAN_NOT_FOUND',
      message: '商品不存在或已下架',
      data: { code: 'PLAN_NOT_FOUND', message: '商品不存在或已下架' }
    })
  }

  return { data: toPlanView(row) }
})
