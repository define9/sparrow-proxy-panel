import { PlanTypeSchema } from '@sparrow/contracts'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { plans } from '../../../../../drizzle/schema'
import { useDb } from '../../../../utils/db'
import { parsePagination } from '../../../../utils/order'
import { toPlanView } from '../../../../utils/plan'
import { requireSessionUser } from '../../../../utils/session-user'

/**
 * GET /api/v1/user/plans
 *
 * 可购买商品列表：仅返回 status = active 的商品。
 * 排序：sort 升序（同值按创建时间倒序），与后台展示顺序一致。
 */
export default defineEventHandler(async (event) => {
  await requireSessionUser(event)

  const query = getQuery(event)
  const { page, pageSize } = parsePagination(query as Record<string, unknown>)
  const parsedType = PlanTypeSchema.safeParse(query.type)
  const type = parsedType.success ? parsedType.data : undefined

  const conditions = [eq(plans.status, 'active')]
  if (type) {
    conditions.push(eq(plans.type, type))
  }

  const db = useDb()

  const rows = await db
    .select()
    .from(plans)
    .where(and(...conditions))
    .orderBy(asc(plans.sort), desc(plans.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [aggregate] = await db
    .select({ total: count() })
    .from(plans)
    .where(and(...conditions))

  const total = aggregate?.total ?? 0

  return {
    data: rows.map(toPlanView),
    meta: {
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      nextCursor: null
    }
  }
})
