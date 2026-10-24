import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { PlanStatusSchema, PlanTypeSchema } from '@sparrow/contracts'
import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { plans } from '../../../../../drizzle/schema'
import { useDb } from '../../../../utils/db'
import { parsePagination } from '../../../../utils/order'
import { toPlanView } from '../../../../utils/plan'
import { requirePermission } from '../../../../utils/auth'

/**
 * GET /api/v1/admin/plans
 *
 * 商品列表（管理端）：按状态 / 类型 / 关键词筛选 + 分页。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLAN_READ)

  const query = getQuery(event)
  const { page, pageSize } = parsePagination(query as Record<string, unknown>)

  const parsedStatus = PlanStatusSchema.safeParse(query.status)
  const status = parsedStatus.success ? parsedStatus.data : undefined
  const parsedType = PlanTypeSchema.safeParse(query.type)
  const type = parsedType.success ? parsedType.data : undefined
  const keyword = typeof query.q === 'string' ? query.q.trim() : ''

  const conditions: SQL[] = []
  if (status) {
    conditions.push(eq(plans.status, status))
  }
  if (type) {
    conditions.push(eq(plans.type, type))
  }
  if (keyword) {
    const pattern = `%${keyword}%`
    conditions.push(or(ilike(plans.name, pattern), ilike(plans.slug, pattern))!)
  }

  const where = conditions.length ? and(...conditions) : undefined

  const db = useDb()

  const rows = await db
    .select()
    .from(plans)
    .where(where)
    .orderBy(asc(plans.sort), desc(plans.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [aggregate] = await db
    .select({ total: count() })
    .from(plans)
    .where(where)

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
