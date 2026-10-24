import type { RenderNode, RenderSubscription } from './types'
import { type NodeProfile, buildNodeProfile, hasRequiredCredentials } from './limits'
import { type YamlValue, stringifyYaml } from './yaml'

/**
 * Clash / Mihomo 配置渲染。
 *
 * 输出结构（只保留客户端必需的部分）：
 * ```yaml
 * proxies:
 *   - name: 香港 01
 *     type: vmess
 *     ...
 * proxy-groups:
 *   - name: Sparrow
 *     type: select
 *     proxies:
 *       - 香港 01
 * ```
 */

/** 策略组名（客户端默认展示的分组） */
export const CLASH_GROUP_NAME = 'Sparrow'

/** mihomo 的协议名映射 */
const CLASH_TYPE: Record<string, string> = {
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  shadowsocks: 'ss',
  hysteria2: 'hysteria2',
  tuic: 'tuic'
}

function transportOpts(profile: NodeProfile): Record<string, YamlValue> | undefined {
  const { node } = profile

  if (node.network === 'ws') {
    return {
      'ws-opts': {
        path: node.path || '/',
        headers: {
          Host: node.hostHeader || node.host
        }
      }
    }
  }

  if (node.network === 'grpc') {
    return {
      'grpc-opts': {
        'grpc-service-name': node.path || ''
      }
    }
  }

  if (node.network === 'http') {
    return {
      'http-opts': {
        path: [node.path || '/'],
        headers: {
          Host: [node.hostHeader || node.host]
        }
      }
    }
  }

  return undefined
}

/** 单个节点 → Clash proxy 对象 */
export function renderClashProxy(subscription: RenderSubscription, node: RenderNode): Record<string, YamlValue> | null {
  const type = CLASH_TYPE[node.protocol]
  if (!type) {
    return null
  }

  if (!hasRequiredCredentials(node)) {
    return null
  }

  const profile = buildNodeProfile(subscription, node)
  const { node: raw } = profile

  const proxy: Record<string, YamlValue> = {
    name: profile.label,
    type,
    server: raw.host,
    port: raw.port,
    udp: true
  }

  const opts = transportOpts(profile)
  if (opts) {
    Object.assign(proxy, opts)
  }

  switch (raw.protocol) {
    case 'vmess': {
      proxy.uuid = raw.uuid || ''
      proxy.alterId = 0
      proxy.cipher = raw.security || 'auto'
      proxy.tls = profile.tls
      if (profile.tls) {
        proxy.servername = profile.serverName
        if (raw.fingerprint) {
          proxy['client-fingerprint'] = raw.fingerprint
        }
      }
      proxy['skip-cert-verify'] = raw.allowInsecure
      break
    }

    case 'vless': {
      proxy.uuid = raw.uuid || ''
      if (raw.flow) {
        proxy.flow = raw.flow
      }
      proxy.tls = profile.tls
      if (profile.tls) {
        proxy.servername = profile.serverName
        if (raw.fingerprint) {
          proxy['client-fingerprint'] = raw.fingerprint
        }
      }
      if (profile.reality) {
        proxy['reality-opts'] = {
          'public-key': raw.realityPublicKey || '',
          'short-id': raw.realityShortId || ''
        }
      }
      proxy['skip-cert-verify'] = raw.allowInsecure
      break
    }

    case 'trojan': {
      proxy.password = raw.password || ''
      proxy.sni = profile.serverName
      if (raw.alpn?.length) {
        proxy.alpn = [...raw.alpn]
      }
      proxy['skip-cert-verify'] = raw.allowInsecure
      break
    }

    case 'shadowsocks': {
      proxy.cipher = raw.method || 'aes-128-gcm'
      proxy.password = raw.password || ''
      break
    }

    case 'hysteria2': {
      proxy.password = raw.password || ''
      proxy.sni = profile.serverName
      proxy['skip-cert-verify'] = raw.allowInsecure
      if (profile.speedLimitMbps > 0) {
        proxy.up = profile.speedLimitMbps
        proxy.down = profile.speedLimitMbps
      }
      break
    }

    case 'tuic': {
      proxy.uuid = raw.uuid || ''
      proxy.password = raw.password || ''
      proxy.sni = profile.serverName
      proxy['congestion-controller'] = 'bbr'
      proxy['udp-relay-mode'] = 'native'
      if (raw.alpn?.length) {
        proxy.alpn = [...raw.alpn]
      }
      if (profile.speedLimitMbps > 0) {
        proxy.up = profile.speedLimitMbps
        proxy.down = profile.speedLimitMbps
      }
      break
    }

    default:
      return null
  }

  return proxy
}

/**
 * 渲染 Clash 订阅：YAML 文本。
 *
 * 纯函数：不访问数据库。
 */
export function renderClash(subscription: RenderSubscription, nodes: RenderNode[]): string {
  const proxies = nodes
    .map(node => renderClashProxy(subscription, node))
    .filter((proxy): proxy is Record<string, YamlValue> => Boolean(proxy))

  const config: Record<string, YamlValue> = {
    proxies,
    'proxy-groups': [
      {
        name: CLASH_GROUP_NAME,
        type: 'select',
        proxies: proxies.map(proxy => proxy.name as string)
      }
    ]
  }

  return stringifyYaml(config)
}
