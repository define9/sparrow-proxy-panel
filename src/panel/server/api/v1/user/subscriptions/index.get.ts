import { count, desc, eq } from 'drizzle-orm'
import { plans, subscriptions } from '../../../../../drizzle/schema'
import { evaluateQuota } from '../../../../utils/quota'
import { toSubscriptionDto } from '../../../../utils/subscription/loader'

/**
 * GET /api/v1/user/subscriptions
 *
 * 当前用户的订阅列表（用户端用 page / pageSize 分页）。
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_TOKEN_EXPIRED',
      message: '请先登录',
      data: { code: 'AUTH_TOKEN_EXPIRED', message: '请先登录' }
    })
  }

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))

  const db = useDb()
  const scope = eq(subscriptions.userId, user.id)

  const rows = await db
    .select({ subscription: subscriptions, planName: plans.name })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(scope)
    .orderBy(desc(subscriptions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [totalRow] = await db.select({ value: count() }).from(subscriptions).where(scope)
  const total = totalRow?.value ?? 0

  return {
    data: rows.map((row) => {
      const dto = toSubscriptionDto(row.subscription, row.planName)
      const quota = evaluateQuota({
        status: row.subscription.status,
        trafficLimit: row.subscription.trafficLimit,
        trafficUsed: row.subscription.trafficUsed,
        expireAt: row.subscription.expireAt
      })

      return { ...dto, quota }
    }),
    meta: {
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      nextCursor: null
    }
  }
})
