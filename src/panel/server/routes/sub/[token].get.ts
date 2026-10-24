import type { H3Event } from 'h3'
import type { SubscriptionFormat } from '@sparrow/contracts'
import { evaluateQuota } from '../../utils/quota'
import {
  findSubscriptionByToken,
  loadSubscriptionNodes,
  renderSubscription,
  toSubscriptionDto
} from '../../utils/subscription'

/**
 * GET /sub/{token}
 *
 * 订阅输出（纯文本）：
 * - `?format=v2ray|clash|singbox` 显式指定格式
 * - 未指定时按 Accept 头推断（yaml → clash，json → singbox），再回落订阅自身的格式
 *
 * 响应头：
 * - `Cache-Control: private, max-age=60`
 * - `Subscription-Userinfo: upload=..; download=..; total=..; expire=..`
 */
const FORMAT_CONTENT_TYPES: Record<SubscriptionFormat, string> = {
  v2ray: 'text/plain; charset=utf-8',
  clash: 'application/yaml; charset=utf-8',
  singbox: 'application/json; charset=utf-8'
}

/** token 必须是 uuid（订阅凭据高熵） */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function resolveFormat(event: H3Event, accept: string | undefined, fallback: SubscriptionFormat): SubscriptionFormat {
  const requested = getQuery(event).format

  if (typeof requested === 'string') {
    const value = requested.toLowerCase()
    if (value === 'v2ray' || value === 'clash' || value === 'singbox') {
      return value
    }
  }

  const header = (accept ?? '').toLowerCase()
  if (header.includes('yaml')) {
    return 'clash'
  }
  if (header.includes('json')) {
    return 'singbox'
  }

  return fallback
}

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

  const quota = evaluateQuota({
    status: subscription.status,
    trafficLimit: subscription.trafficLimit,
    trafficUsed: subscription.trafficUsed,
    expireAt: subscription.expireAt
  })

  // 过期 / 超量 / 暂停：返回可读的提示文本（客户端会直接展示给用户）
  if (!quota.allowed) {
    const code = quota.expired ? 'SUB_EXPIRED' : quota.overused ? 'SUB_OVERUSED' : 'SUB_EXPIRED'
    const message = quota.expired
      ? '订阅已过期，请续费后重新获取订阅。'
      : quota.overused
        ? '订阅流量已用尽，请等待流量重置或续费。'
        : '订阅已暂停或已取消，请联系管理员。'

    setResponseStatus(event, 403)
    setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
    setResponseHeader(event, 'cache-control', 'private, max-age=60')
    setResponseHeader(event, 'x-error-code', code)

    return `${message}\n(${code})`
  }

  const format = resolveFormat(event, getRequestHeader(event, 'accept'), subscription.format)
  const nodes = await loadSubscriptionNodes(db, subscription)
  const payload = renderSubscription(format, toSubscriptionDto(subscription), nodes)

  setResponseHeader(event, 'content-type', FORMAT_CONTENT_TYPES[format])
  setResponseHeader(event, 'cache-control', 'private, max-age=60')
  setResponseHeader(event, 'subscription-userinfo', [
    `upload=${subscription.upload}`,
    `download=${subscription.download}`,
    `total=${subscription.trafficLimit}`,
    `expire=${subscription.expireAt ? Math.floor(subscription.expireAt.getTime() / 1000) : 0}`
  ].join('; '))

  return payload
})
