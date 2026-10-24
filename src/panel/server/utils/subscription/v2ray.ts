import type { RenderNode, RenderSubscription } from './types'
import { type NodeProfile, buildNodeProfile, hasRequiredCredentials } from './limits'

/**
 * V2Ray / v2rayN 分享链接渲染。
 *
 * 输出为「每行一条链接」的纯文本，再整体做 base64 编码（客户端订阅的通用格式）：
 * - `vmess://`  base64(JSON)
 * - `vless://`  uuid@host:port?params#name
 * - `trojan://` password@host:port?params#name
 * - `ss://`     base64url(method:password)@host:port#name
 *
 * 另外兼容 `hysteria2://` 与 `tuic://`。
 */

/** 链接里允许出现的协议 */
const SUPPORTED_PROTOCOLS = new Set(['vmess', 'vless', 'trojan', 'shadowsocks', 'hysteria2', 'tuic'])

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    parts.push(`${key}=${encodeURIComponent(String(value))}`)
  }

  return parts.join('&')
}

function fragment(label: string): string {
  return `#${encodeURIComponent(label)}`
}

function securityOf(profile: NodeProfile): 'none' | 'tls' | 'reality' {
  if (profile.reality) {
    return 'reality'
  }
  return profile.tls ? 'tls' : 'none'
}

/** 传输层通用参数 */
function transportParams(profile: NodeProfile): Record<string, string | number | null | undefined> {
  const { node } = profile
  const params: Record<string, string | number | null | undefined> = {
    type: node.network,
    headerType: node.network === 'tcp' ? 'none' : undefined
  }

  if (node.network === 'ws') {
    params.path = node.path || '/'
    params.host = node.hostHeader || node.host
  } else if (node.network === 'grpc') {
    params.serviceName = node.path || ''
    params.mode = 'gun'
  } else if (node.network === 'http') {
    params.path = node.path || '/'
    params.host = node.hostHeader || node.host
  }

  return params
}

/** TLS / REALITY 参数 */
function tlsParams(profile: NodeProfile): Record<string, string | number | null | undefined> {
  const { node } = profile
  if (!profile.tls) {
    return {}
  }

  const params: Record<string, string | number | null | undefined> = {
    sni: profile.serverName,
    alpn: node.alpn?.length ? node.alpn.join(',') : undefined
  }

  if (node.fingerprint) {
    params.fp = node.fingerprint
  }
  if (node.allowInsecure) {
    params.allowInsecure = 1
  }
  if (profile.reality) {
    params.pbk = node.realityPublicKey
    params.sid = node.realityShortId
  }

  return params
}

/** vmess 分享链接（base64 JSON） */
function renderVmess(profile: NodeProfile): string {
  const { node, label } = profile

  const payload: Record<string, string> = {
    v: '2',
    ps: label,
    add: node.host,
    port: String(node.port),
    id: node.uuid || '',
    aid: '0',
    net: node.network,
    type: node.network === 'grpc' ? 'gun' : 'none',
    host: node.hostHeader || node.host,
    path: node.path || '',
    tls: profile.tls ? 'tls' : '',
    sni: profile.tls ? profile.serverName : '',
    alpn: node.alpn?.length ? node.alpn.join(',') : '',
    fp: node.fingerprint || '',
    scy: node.security || 'auto'
  }

  // v2rayN 约定：uplink / downlink 为限速（Mbps）
  if (profile.speedLimitMbps > 0) {
    payload.uplink = String(profile.speedLimitMbps)
    payload.downlink = String(profile.speedLimitMbps)
  }

  return `vmess://${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`
}

/** vless 分享链接 */
function renderVless(profile: NodeProfile): string {
  const { node, label } = profile
  const query = buildQuery({
    encryption: 'none',
    ...transportParams(profile),
    security: securityOf(profile),
    ...tlsParams(profile),
    flow: node.flow
  })

  return `vless://${node.uuid || ''}@${node.host}:${node.port}?${query}${fragment(label)}`
}

/** trojan 分享链接 */
function renderTrojan(profile: NodeProfile): string {
  const { node, label } = profile
  const query = buildQuery({
    ...transportParams(profile),
    security: profile.tls ? 'tls' : 'none',
    ...tlsParams(profile)
  })

  return `trojan://${encodeURIComponent(node.password || '')}@${node.host}:${node.port}?${query}${fragment(label)}`
}

/** shadowsocks 分享链接（SIP002） */
function renderShadowsocks(profile: NodeProfile): string {
  const { node, label } = profile
  const userinfo = Buffer.from(`${node.method || 'aes-128-gcm'}:${node.password || ''}`, 'utf8').toString('base64url')

  return `ss://${userinfo}@${node.host}:${node.port}${fragment(label)}`
}

/** hysteria2 分享链接 */
function renderHysteria2(profile: NodeProfile): string {
  const { node, label } = profile
  const query = buildQuery({
    sni: profile.serverName,
    insecure: node.allowInsecure ? 1 : undefined,
    alpn: node.alpn?.length ? node.alpn.join(',') : undefined
  })

  return `hysteria2://${encodeURIComponent(node.password || '')}@${node.host}:${node.port}?${query}${fragment(label)}`
}

/** tuic 分享链接 */
function renderTuic(profile: NodeProfile): string {
  const { node, label } = profile
  const query = buildQuery({
    congestion_control: 'bbr',
    alpn: node.alpn?.length ? node.alpn.join(',') : 'h3',
    sni: profile.serverName,
    insecure: node.allowInsecure ? 1 : undefined
  })

  return `tuic://${node.uuid || ''}:${encodeURIComponent(node.password || '')}@${node.host}:${node.port}?${query}${fragment(label)}`
}

/** 单个节点 → 分享链接；不支持的协议返回 null */
export function renderNodeLink(subscription: RenderSubscription, node: RenderNode): string | null {
  if (!SUPPORTED_PROTOCOLS.has(node.protocol)) {
    return null
  }

  if (!hasRequiredCredentials(node)) {
    return null
  }

  const profile = buildNodeProfile(subscription, node)

  switch (node.protocol) {
    case 'vmess':
      return renderVmess(profile)
    case 'vless':
      return renderVless(profile)
    case 'trojan':
      return renderTrojan(profile)
    case 'shadowsocks':
      return renderShadowsocks(profile)
    case 'hysteria2':
      return renderHysteria2(profile)
    case 'tuic':
      return renderTuic(profile)
    default:
      return null
  }
}

/**
 * 渲染 V2Ray 订阅：链接列表的 base64 文本。
 *
 * 纯函数：不访问数据库，同样的输入永远得到同样的输出。
 */
export function renderV2Ray(subscription: RenderSubscription, nodes: RenderNode[]): string {
  const links = nodes
    .map(node => renderNodeLink(subscription, node))
    .filter((link): link is string => Boolean(link))

  return Buffer.from(links.join('\n'), 'utf8').toString('base64')
}
