import { route } from '@/lib/api/response'
import {
  findSubscriptionByToken,
  listVisibleNodes,
  subscriptionAvailability,
  subscriptionUserinfo
} from '@/lib/services/subscription'
import { contentTypeFor, render, type SubscriptionFormat } from '@/lib/subscription/render'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ token: string }>
}

const FORMAT_ALIASES: Record<string, SubscriptionFormat> = {
  clash: 'clash',
  'clash-meta': 'clash',
  yaml: 'clash',
  meta: 'clash',
  v2ray: 'v2ray',
  v2rayng: 'v2ray',
  vmess: 'v2ray',
  xray: 'v2ray',
  singbox: 'singbox',
  'sing-box': 'singbox',
  sing_box: 'singbox',
  json: 'singbox'
}

/** ?format= 优先，其次 Accept，最后默认 clash */
function resolveFormat(raw: string | null, accept: string | null): SubscriptionFormat {
  const fromQuery = FORMAT_ALIASES[(raw ?? '').trim().toLowerCase()]
  if (fromQuery) return fromQuery

  const header = (accept ?? '').toLowerCase()
  if (header.includes('sing-box') || header.includes('singbox')) return 'singbox'
  if (header.includes('clash') || header.includes('yaml')) return 'clash'
  if (header.includes('v2ray') || header.includes('vmess')) return 'v2ray'
  return 'clash'
}

function plainText(body: string, status: number, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, max-age=60',
      ...headers
    }
  })
}

export const GET = route(async (req: Request, ctx: RouteContext) => {
  const { token } = await ctx.params
  const format = resolveFormat(
    new URL(req.url).searchParams.get('format'),
    req.headers.get('accept')
  )

  if (!token || token.length > 128) {
    return plainText('订阅不存在或已被删除。\n', 404, { 'cache-control': 'no-store' })
  }

  const subscription = await findSubscriptionByToken(token)
  if (!subscription) {
    return plainText('订阅不存在或已被删除，请回到面板确认订阅链接。\n', 404, {
      'cache-control': 'no-store'
    })
  }

  const userinfo = subscriptionUserinfo(subscription)
  const availability = subscriptionAvailability(subscription)

  if (!availability.usable) {
    return plainText(
      [
        '# Sparrow 订阅暂不可用',
        `# 原因：${availability.reason}`,
        `# 到期时间：${subscription.expireAt.toISOString()}`,
        `# 已用流量：${subscription.trafficUsed} / ${subscription.trafficLimit || '不限'}`,
        '# 如有疑问请联系站点管理员。',
        ''
      ].join('\n'),
      200,
      { 'subscription-userinfo': userinfo, 'profile-update-interval': '24' }
    )
  }

  const nodes = await listVisibleNodes(subscription)
  const etag = `W/"${[
    subscription.id,
    format,
    subscription.trafficUsed,
    subscription.status,
    subscription.expireAt.getTime(),
    nodes.length
  ].join('-')}"`

  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': 'private, max-age=60' }
    })
  }

  const body = render(subscription, nodes, format)

  return plainText(body, 200, {
    'content-type': contentTypeFor(),
    'subscription-userinfo': userinfo,
    'profile-update-interval': '24',
    'content-disposition': `attachment; filename="${format}.txt"`,
    etag
  })
})
