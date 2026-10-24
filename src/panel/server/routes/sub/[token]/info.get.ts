import { evaluateQuota } from '../../../utils/quota'
import {
  buildSubscriptionUrls,
  findSubscriptionByToken,
  resolveBaseUrl,
  toSubscriptionDto
} from '../../../utils/subscription'

/**
 * GET /sub/{token}/info
 *
 * 订阅信息（JSON）：用户端「订阅设置」页用。
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token || !UUID_PATTERN.test(token)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'SUB_NOT_FOUND',
      message: '订阅不存在',
      data: { code: 'SUB_NOT_FOUND', message: '订阅不存在' }
    })
  }

  const db = useDb()
  const subscription = await findSubscriptionByToken(db, token)

  if (!subscription) {
    throw createError({
      statusCode: 404,
      statusMessage: 'SUB_NOT_FOUND',
      message: '订阅不存在',
      data: { code: 'SUB_NOT_FOUND', message: '订阅不存在' }
    })
  }

  const dto = toSubscriptionDto(subscription)
  const quota = evaluateQuota({
    status: subscription.status,
    trafficLimit: subscription.trafficLimit,
    trafficUsed: subscription.trafficUsed,
    expireAt: subscription.expireAt
  })

  return {
    token: subscription.token,
    format: subscription.format,
    quota,
    expireAt: dto.expireAt ?? null,
    urls: buildSubscriptionUrls(resolveBaseUrl(event), subscription.token),
    updatedAt: subscription.updatedAt.toISOString()
  }
})
