import { PERMISSIONS, UpdateSubscriptionSchema } from '@sparrow/contracts'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { subscriptionNodeGroups, subscriptions } from '../../../../../drizzle/schema'
import { validateBody } from '../../../../utils/validate'
import {
  buildSubscriptionDetail,
  requireOwnedSubscription,
  writeIpWhitelist
} from '../../../../utils/subscription'

/**
 * PATCH /api/v1/user/subscriptions/{id}
 *
 * 修改订阅：
 * - 订阅本人可改：订阅格式、设备数上限、限速、IP 白名单
 * - 仅管理员可改：流量配额、到期时间、可见节点组
 */
const BodySchema = UpdateSubscriptionSchema.extend({
  ipWhitelist: z.array(z.string().trim().min(1).max(64)).max(50).optional()
})

/** 只有管理员能改的字段 */
const ADMIN_ONLY_FIELDS = ['trafficLimit', 'expireAt', 'nodeGroupIds'] as const

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

  const body = await validateBody(event, BodySchema)

  const permissions = user.permissions ?? []
  const isAdmin = permissions.includes('*') || permissions.includes(PERMISSIONS.ADMIN_SUBSCRIPTION_WRITE)

  const touchesAdminField = ADMIN_ONLY_FIELDS.some(field => body[field] !== undefined)
  if (touchesAdminField && !isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'PERM_DENIED',
      message: '流量配额、到期时间与节点组只能由管理员修改',
      data: { code: 'PERM_DENIED', message: '流量配额、到期时间与节点组只能由管理员修改' }
    })
  }

  const db = useDb()
  const subscription = await requireOwnedSubscription(db, user.id, id)

  const patch: Partial<typeof subscriptions.$inferInsert> = { updatedAt: new Date() }

  if (body.format !== undefined) {
    patch.format = body.format
  }
  if (body.deviceLimit !== undefined) {
    patch.deviceLimit = body.deviceLimit
  }
  if (body.speedLimitMbps !== undefined) {
    patch.speedLimitMbps = body.speedLimitMbps
  }
  if (body.trafficLimit !== undefined) {
    patch.trafficLimit = body.trafficLimit
  }
  if (body.expireAt !== undefined) {
    patch.expireAt = body.expireAt ? new Date(body.expireAt) : null
  }

  await db
    .update(subscriptions)
    .set(patch)
    .where(eq(subscriptions.id, subscription.id))

  if (body.nodeGroupIds !== undefined) {
    await db.delete(subscriptionNodeGroups).where(eq(subscriptionNodeGroups.subscriptionId, subscription.id))

    if (body.nodeGroupIds.length > 0) {
      await db
        .insert(subscriptionNodeGroups)
        .values(body.nodeGroupIds.map(nodeGroupId => ({ subscriptionId: subscription.id, nodeGroupId })))
    }
  }

  if (body.ipWhitelist !== undefined) {
    await writeIpWhitelist(db, subscription.id, body.ipWhitelist)
  }

  const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).limit(1)

  return buildSubscriptionDetail(db, event, updated ?? subscription)
})
