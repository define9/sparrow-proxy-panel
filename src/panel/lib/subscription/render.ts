/**
 * 订阅渲染：纯函数，无 IO。
 * render(subscription, nodes, format) → string
 *
 * - clash   : YAML（clash.meta 结构）
 * - v2ray   : base64(JSON)（xray/v2ray 出站配置）
 * - singbox : JSON（sing-box outbounds）
 *
 * 只保证结构正确，不追求内核参数完备；插件可通过 subscription.render hook 覆盖。
 */

export type SubscriptionFormat = 'clash' | 'v2ray' | 'singbox'

export interface RenderSubscription {
  token: string
  name: string
  deviceLimit?: number
  speedLimitMbps?: number
}

export interface RenderNode {
  id: string
  name: string
  protocol: string
  host: string
  port: number
  network?: string | null
  tlsMode?: string | null
  sni?: string | null
  path?: string | null
  hostHeader?: string | null
  alpn?: string[] | null
  allowInsecure?: boolean | null
  realityPublicKey?: string | null
  realityShortId?: string | null
  flow?: string | null
  method?: string | null
}

const PROXY_TYPES = new Set(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic'])

/** 与内核无关的确定性 uuid：同一订阅 + 同一节点永远得到同一个 id */
export function nodeUuid(subscriptionToken: string, nodeId: string) {
  const source = `${subscriptionToken}:${nodeId}`
  const bytes = new Uint8Array(16)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i)
    h1 = (h1 ^ code) * 0x01000193
    h2 = (h2 + code * (i + 7)) * 0x85ebca6b
  }
  for (let i = 0; i < 16; i += 1) {
    h1 = (h1 ^ (h1 >>> 13)) * 0x5bd1e995
    h2 = (h2 ^ (h2 >>> 15)) * 0x27d4eb2f
    bytes[i] = (h1 ^ h2 ^ (i * 31)) & 0xff
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join(
    '-'
  )
}

function nodePassword(subscriptionToken: string, nodeId: string) {
  return nodeUuid(subscriptionToken, nodeId).replace(/-/g, '').slice(0, 24)
}

function displayName(node: RenderNode) {
  return node.name || node.host
}

function transportOf(node: RenderNode) {
  const network = (node.network ?? 'tcp').toLowerCase()
  if (network === 'ws' || network === 'grpc') return network
  return 'tcp'
}

function tlsEnabled(node: RenderNode) {
  return (node.tlsMode ?? 'none') !== 'none'
}

function realityEnabled(node: RenderNode) {
  return node.tlsMode === 'reality' && !!node.realityPublicKey
}

function json(value: unknown) {
  return JSON.stringify(value)
}

function yamlString(value: string) {
  return json(value)
}

function toBase64(input: string) {
  return Buffer.from(input, 'utf8').toString('base64')
}

function usableNodes(nodes: RenderNode[]) {
  return nodes.filter((node) => PROXY_TYPES.has(node.protocol) && !!node.host && node.port > 0)
}

/* ------------------------------------------------------------------ clash */

function clashProxy(subscription: RenderSubscription, node: RenderNode): string[] {
  const name = displayName(node)
  const lines: string[] = [
    `  - name: ${yamlString(name)}`,
    `    type: ${node.protocol}`,
    `    server: ${yamlString(node.host)}`,
    `    port: ${node.port}`,
    '    udp: true'
  ]

  switch (node.protocol) {
    case 'vless':
      lines.push(`    uuid: ${nodeUuid(subscription.token, node.id)}`)
      lines.push('    encryption: none')
      if (node.flow) lines.push(`    flow: ${node.flow}`)
      break
    case 'vmess':
      lines.push(`    uuid: ${nodeUuid(subscription.token, node.id)}`)
      lines.push('    alterId: 0')
      lines.push('    cipher: auto')
      break
    case 'trojan':
      lines.push(`    password: ${yamlString(nodePassword(subscription.token, node.id))}`)
      break
    case 'shadowsocks':
      lines.push(`    cipher: ${node.method ?? 'aes-256-gcm'}`)
      lines.push(`    password: ${yamlString(nodePassword(subscription.token, node.id))}`)
      break
    case 'hysteria2':
      lines.push(`    password: ${yamlString(nodePassword(subscription.token, node.id))}`)
      break
    case 'tuic':
      lines.push(`    uuid: ${nodeUuid(subscription.token, node.id)}`)
      lines.push(`    password: ${yamlString(nodePassword(subscription.token, node.id))}`)
      break
    default:
      break
  }

  if (tlsEnabled(node)) {
    lines.push('    tls: true')
    if (node.sni) lines.push(`    servername: ${yamlString(node.sni)}`)
    if (node.alpn?.length) lines.push(`    alpn: [${node.alpn.map(yamlString).join(', ')}]`)
    if (node.allowInsecure) lines.push('    skip-cert-verify: true')
    if (node.protocol === 'vless' || node.protocol === 'vmess') {
      lines.push('    client-fingerprint: chrome')
    }
  }

  if (realityEnabled(node)) {
    lines.push('    reality-opts:')
    lines.push(`      public-key: ${yamlString(node.realityPublicKey ?? '')}`)
    if (node.realityShortId) lines.push(`      short-id: ${yamlString(node.realityShortId)}`)
  }

  const transport = transportOf(node)
  if (transport !== 'tcp') {
    lines.push(`    network: ${transport}`)
    if (transport === 'ws') {
      lines.push('    ws-opts:')
      lines.push(`      path: ${yamlString(node.path ?? '/')}`)
      if (node.hostHeader) {
        lines.push('      headers:')
        lines.push(`        Host: ${yamlString(node.hostHeader)}`)
      }
    } else if (transport === 'grpc') {
      lines.push('    grpc-opts:')
      lines.push(`      grpc-service-name: ${yamlString(node.path ?? 'grpc')}`)
    }
  }

  return lines
}

function renderClash(subscription: RenderSubscription, nodes: RenderNode[]): string {
  const names = nodes.map(displayName)
  const lines: string[] = [
    '# generated by sparrow-panel',
    `# subscription: ${subscription.name}`,
    'port: 7890',
    'socks-port: 7891',
    'allow-lan: false',
    'mode: rule',
    'log-level: info',
    'proxies:'
  ]

  if (nodes.length === 0) {
    lines.push('  []')
  } else {
    for (const node of nodes) lines.push(...clashProxy(subscription, node))
  }

  lines.push('proxy-groups:')
  lines.push(`  - name: ${yamlString('节点选择')}`)
  lines.push('    type: select')
  lines.push(`    proxies: [${[...names, 'DIRECT'].map(yamlString).join(', ')}]`)
  lines.push('rules:')
  lines.push(`  - MATCH,${yamlString('节点选择')}`)

  return `${lines.join('\n')}\n`
}

/* ------------------------------------------------------------------ v2ray */

function v2rayStreamSettings(node: RenderNode) {
  const transport = transportOf(node)
  const stream: Record<string, unknown> = {
    network: transport,
    security: realityEnabled(node) ? 'reality' : tlsEnabled(node) ? 'tls' : 'none'
  }

  if (tlsEnabled(node)) {
    stream.tlsSettings = {
      serverName: node.sni ?? node.host,
      allowInsecure: !!node.allowInsecure,
      ...(node.alpn?.length ? { alpn: node.alpn } : {})
    }
  }

  if (realityEnabled(node)) {
    stream.realitySettings = {
      serverName: node.sni ?? node.host,
      publicKey: node.realityPublicKey,
      shortId: node.realityShortId ?? '',
      fingerprint: 'chrome'
    }
  }

  if (transport === 'ws') {
    stream.wsSettings = {
      path: node.path ?? '/',
      ...(node.hostHeader ? { headers: { Host: node.hostHeader } } : {})
    }
  } else if (transport === 'grpc') {
    stream.grpcSettings = { serviceName: node.path ?? 'grpc' }
  }

  return stream
}

function v2rayOutbound(subscription: RenderSubscription, node: RenderNode) {
  const base = {
    tag: displayName(node),
    settings: {} as Record<string, unknown>,
    streamSettings: v2rayStreamSettings(node)
  }

  switch (node.protocol) {
    case 'vless':
      return {
        ...base,
        protocol: 'vless',
        settings: {
          vnext: [
            {
              address: node.host,
              port: node.port,
              users: [
                {
                  id: nodeUuid(subscription.token, node.id),
                  encryption: 'none',
                  ...(node.flow ? { flow: node.flow } : {})
                }
              ]
            }
          ]
        }
      }
    case 'vmess':
      return {
        ...base,
        protocol: 'vmess',
        settings: {
          vnext: [
            {
              address: node.host,
              port: node.port,
              users: [
                {
                  id: nodeUuid(subscription.token, node.id),
                  alterId: 0,
                  security: 'auto'
                }
              ]
            }
          ]
        }
      }
    case 'trojan':
      return {
        ...base,
        protocol: 'trojan',
        settings: {
          servers: [
            {
              address: node.host,
              port: node.port,
              password: nodePassword(subscription.token, node.id)
            }
          ]
        }
      }
    case 'shadowsocks':
      return {
        ...base,
        protocol: 'shadowsocks',
        settings: {
          servers: [
            {
              address: node.host,
              port: node.port,
              method: node.method ?? 'aes-256-gcm',
              password: nodePassword(subscription.token, node.id)
            }
          ]
        }
      }
    default:
      return {
        ...base,
        protocol: 'trojan',
        settings: {
          servers: [
            {
              address: node.host,
              port: node.port,
              password: nodePassword(subscription.token, node.id)
            }
          ]
        }
      }
  }
}

function renderV2ray(subscription: RenderSubscription, nodes: RenderNode[]): string {
  // xray 不支持 hysteria2/tuic，这里跳过，避免客户端解析失败
  const supported = nodes.filter((node) => node.protocol !== 'hysteria2' && node.protocol !== 'tuic')
  const config = {
    remarks: subscription.name,
    outbounds: supported.map((node) => v2rayOutbound(subscription, node))
  }
  return toBase64(JSON.stringify(config, null, 2))
}

/* ---------------------------------------------------------------- singbox */

function singboxTls(node: RenderNode) {
  if (!tlsEnabled(node)) return undefined
  return {
    enabled: true,
    server_name: node.sni ?? node.host,
    ...(node.alpn?.length ? { alpn: node.alpn } : {}),
    ...(node.allowInsecure ? { insecure: true } : {}),
    ...(realityEnabled(node)
      ? {
          reality: {
            enabled: true,
            public_key: node.realityPublicKey,
            short_id: node.realityShortId ?? ''
          },
          utls: { enabled: true, fingerprint: 'chrome' }
        }
      : {})
  }
}

function singboxTransport(node: RenderNode) {
  const transport = transportOf(node)
  if (transport === 'ws') {
    return {
      type: 'ws',
      path: node.path ?? '/',
      ...(node.hostHeader ? { headers: { Host: node.hostHeader } } : {})
    }
  }
  if (transport === 'grpc') {
    return { type: 'grpc', service_name: node.path ?? 'grpc' }
  }
  return undefined
}

function singboxOutbound(subscription: RenderSubscription, node: RenderNode) {
  const common = {
    tag: displayName(node),
    server: node.host,
    server_port: node.port,
    ...(singboxTransport(node) ? { transport: singboxTransport(node) } : {}),
    ...(singboxTls(node) ? { tls: singboxTls(node) } : {})
  }

  switch (node.protocol) {
    case 'vless':
      return {
        ...common,
        type: 'vless',
        uuid: nodeUuid(subscription.token, node.id),
        ...(node.flow ? { flow: node.flow } : {})
      }
    case 'vmess':
      return {
        ...common,
        type: 'vmess',
        uuid: nodeUuid(subscription.token, node.id),
        security: 'auto',
        alter_id: 0
      }
    case 'trojan':
      return {
        ...common,
        type: 'trojan',
        password: nodePassword(subscription.token, node.id)
      }
    case 'shadowsocks':
      return {
        ...common,
        type: 'shadowsocks',
        method: node.method ?? 'aes-256-gcm',
        password: nodePassword(subscription.token, node.id)
      }
    case 'hysteria2':
      return {
        ...common,
        type: 'hysteria2',
        password: nodePassword(subscription.token, node.id)
      }
    case 'tuic':
      return {
        ...common,
        type: 'tuic',
        uuid: nodeUuid(subscription.token, node.id),
        password: nodePassword(subscription.token, node.id)
      }
    default:
      return {
        ...common,
        type: 'trojan',
        password: nodePassword(subscription.token, node.id)
      }
  }
}

function renderSingbox(subscription: RenderSubscription, nodes: RenderNode[]): string {
  const outbounds = nodes.map((node) => singboxOutbound(subscription, node))
  const tags = nodes.map(displayName)

  const config = {
    log: { level: 'info', timestamp: true },
    dns: {
      servers: [{ tag: 'dns-remote', address: 'https://1.1.1.1/dns-query' }]
    },
    inbounds: [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: 2080
      }
    ],
    outbounds: [
      { type: 'selector', tag: '节点选择', outbounds: [...tags, 'direct'], default: tags[0] ?? 'direct' },
      ...outbounds,
      { type: 'direct', tag: 'direct' }
    ],
    route: { final: '节点选择', auto_detect_interface: true }
  }

  return `${JSON.stringify(config, null, 2)}\n`
}

/* ------------------------------------------------------------------ entry */

export function render(
  subscription: RenderSubscription,
  nodes: RenderNode[],
  format: SubscriptionFormat
): string {
  const list = usableNodes(nodes)
  switch (format) {
    case 'v2ray':
      return renderV2ray(subscription, list)
    case 'singbox':
      return renderSingbox(subscription, list)
    case 'clash':
    default:
      return renderClash(subscription, list)
  }
}

/** 订阅输出统一 text/plain：客户端只认内容，不认 mime */
export function contentTypeFor() {
  return 'text/plain; charset=utf-8'
}
