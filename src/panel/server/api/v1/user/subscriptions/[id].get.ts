import { buildSubscriptionDetail, requireOwnedSubscription } from '../../../../utils/subscription'

/**
 * GET /api/v1/user/subscriptions/{id}
 *
 * 订阅详情：包含配额状态、各格式订阅链接、IP 白名单与可见节点数量。
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

  return buildSubscriptionDetail(db, event, subscription)
})
