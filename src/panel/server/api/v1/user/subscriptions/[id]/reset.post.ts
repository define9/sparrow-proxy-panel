import { PERMISSIONS } from '@sparrow/contracts'
import { eq } from 'drizzle-orm'
import { plans, subscriptions } from '../../../../../../drizzle/schema'
import { canResetTraffic, nextResetAt } from '../../../../../utils/quota'
import { requireOwnedSubscription } from '../../../../../utils/subscription'

/**
 * POST /api/v1/user/subscriptions/{id}/reset
 *
 * 重置订阅流量。
 *
 * 权限：订阅本人（需已到重置周期）或管理员。
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

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'SUB_NOT_FOUND',
      message: '订阅不存在',
      data: { code: 'SUB_NOT_FOUND', message: '订阅不存在' }
    })
  }

  const db = useDb()
  const subscription = await requireOwnedSubscription(db, user.id, id)

  const permissions = user.permissions ?? []
  const isAdmin = permissions.includes('*') || permissions.includes(PERMISSIONS.ADMIN_SUBSCRIPTION_WRITE)

  if (!isAdmin && !canResetTraffic(subscription.resetAt)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'PERM_DENIED',
      message: '当前计费周期内不能重复重置流量',
      data: { code: 'PERM_DENIED', message: '当前计费周期内不能重复重置流量' }
    })
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1)

  await db
    .update(subscriptions)
    .set({
      trafficUsed: 0,
      upload: 0,
      download: 0,
      resetAt: nextResetAt(plan?.resetDay ?? null),
      updatedAt: new Date()
    })
    .where(eq(subscriptions.id, subscription.id))

  return { ok: true, resetAt: nextResetAt(plan?.resetDay ?? null).toISOString() }
})
