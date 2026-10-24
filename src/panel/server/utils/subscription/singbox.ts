import type { RenderNode, RenderSubscription } from './types'
import { type NodeProfile, buildNodeProfile, hasRequiredCredentials } from './limits'

/**
 * sing-box 出站（outbound）渲染。
 *
 * 输出为 JSON，对象顶层只有 `outbounds` 数组，客户端可直接取用：
 * ```json
 * { "outbounds": [ { "type": "vless", "tag": "香港 01", ... } ] }
 * ```
 */

/** sing-box 的协议名映射 */
const SINGBOX_TYPE: Record<string, string> = {
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  shadowsocks: 'shadowsocks',
  hysteria2: 'hysteria2',
  tuic: 'tuic'
}

function tlsOptions(profile: NodeProfile): Record<string, unknown> | undefined {
  const { node } = profile
  if (!profile.tls) {
    return undefined
  }

  const tls: Record<string, unknown> = {
    enabled: true,
    server_name: profile.serverName,
    insecure: Boolean(node.allowInsecure)
  }

  if (node.alpn?.length) {
    tls.alpn = [...node.alpn]
  }

  if (node.fingerprint) {
    tls.utls = { enabled: true, fingerprint: node.fingerprint }
  }

  if (profile.reality) {
    tls.reality = {
      enabled: true,
      public_key: node.realityPublicKey || '',
      short_id: node.realityShortId || ''
    }
  }

  return tls
}

function transportOptions(profile: NodeProfile): Record<string, unknown> | undefined {
  const { node } = profile

  if (node.network === 'ws') {
    return {
      type: 'ws',
      path: node.path || '/',
      headers: {
        Host: node.hostHeader || node.host
      }
    }
  }

  if (node.network === 'grpc') {
    return {
      type: 'grpc',
      service_name: node.path || ''
    }
  }

  if (node.network === 'http') {
    return {
      type: 'http',
      host: [node.hostHeader || node.host],
      path: node.path || '/'
    }
  }

  return undefined
}

/** 单个节点 → sing-box outbound 对象 */
export function renderSingboxOutbound(subscription: RenderSubscription, node: RenderNode): Record<string, unknown> | null {
  const type = SINGBOX_TYPE[node.protocol]
  if (!type) {
    return null
  }

  if (!hasRequiredCredentials(node)) {
    return null
  }

  const profile = buildNodeProfile(subscription, node)
  const { node: raw } = profile

  const outbound: Record<string, unknown> = {
    type,
    tag: profile.label,
    server: raw.host,
    server_port: raw.port
  }

  switch (raw.protocol) {
    case 'vmess':
      outbound.uuid = raw.uuid || ''
      outbound.security = raw.security || 'auto'
      outbound.alter_id = 0
      break

    case 'vless':
      outbound.uuid = raw.uuid || ''
      if (raw.flow) {
        outbound.flow = raw.flow
      }
      break

    case 'trojan':
      outbound.password = raw.password || ''
      break

    case 'shadowsocks':
      outbound.method = raw.method || 'aes-128-gcm'
      outbound.password = raw.password || ''
      break

    case 'hysteria2':
      outbound.password = raw.password || ''
      if (profile.speedLimitMbps > 0) {
        outbound.up_mbps = profile.speedLimitMbps
        outbound.down_mbps = profile.speedLimitMbps
      }
      break

    case 'tuic':
      outbound.uuid = raw.uuid || ''
      outbound.password = raw.password || ''
      outbound.congestion_control = 'bbr'
      if (profile.speedLimitMbps > 0) {
        outbound.up_mbps = profile.speedLimitMbps
        outbound.down_mbps = profile.speedLimitMbps
      }
      break

    default:
      return null
  }

  const tls = tlsOptions(profile)
  if (tls) {
    outbound.tls = tls
  }

  const transport = transportOptions(profile)
  if (transport) {
    outbound.transport = transport
  }

  return outbound
}

/**
 * 渲染 sing-box 订阅：JSON 文本。
 *
 * 纯函数：不访问数据库。
 */
export function renderSingbox(subscription: RenderSubscription, nodes: RenderNode[]): string {
  const outbounds = nodes
    .map(node => renderSingboxOutbound(subscription, node))
    .filter((outbound): outbound is Record<string, unknown> => Boolean(outbound))

  return `${JSON.stringify({ outbounds }, null, 2)}\n`
}
