import { ok, route } from '@/lib/api/response'
import {
  findSubscriptionByToken,
  listVisibleNodes,
  subscriptionAvailability
} from '@/lib/services/subscription'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ token: string }>
}

/** 订阅信息（JSON）：订阅设置页与客户端兼容性检查用 */
export const GET = route(async (_req: Request, ctx: RouteContext) => {
  const { token } = await ctx.params
  const subscription = token && token.length <= 128 ? await findSubscriptionByToken(token) : null

  if (!subscription) {
    return ok(
      { statusCode: 404, code: 'SUB_NOT_FOUND', message: '订阅不存在或已被删除', data: {} },
      { status: 404, headers: { 'cache-control': 'no-store' } }
    )
  }

  const nodes = await listVisibleNodes(subscription)
  const availability = subscriptionAvailability(subscription)

  return ok(
    {
      name: subscription.name,
      status: subscription.status,
      format: subscription.format,
      usable: availability.usable,
      reason: availability.reason,
      trafficLimit: subscription.trafficLimit,
      trafficUsed: subscription.trafficUsed,
      trafficRemaining:
        subscription.trafficLimit > 0
          ? Math.max(subscription.trafficLimit - subscription.trafficUsed, 0)
          : null,
      upload: subscription.upload,
      download: subscription.download,
      deviceLimit: subscription.deviceLimit,
      speedLimitMbps: subscription.speedLimitMbps,
      expireAt: subscription.expireAt.toISOString(),
      nodeCount: nodes.length
    },
    { headers: { 'cache-control': 'private, max-age=60' } }
  )
})
