import type { CoreCertificate, CoreConfig, CoreUserRule, NodeProtocol } from '@sparrow/contracts'
import type { NodeRenderInput } from './config-singbox'
import { NodeRenderError, safeFileName } from './config-singbox'

/**
 * Xray 内核配置渲染。
 *
 * 纯函数：不查库、不读环境变量，输入相同则输出相同（便于快照测试）。
 *
 * 与 sing-box 的差异：
 * - 出站协议名为 `freedom` / `blackhole`
 * - 路由段叫 `routing`（不是 `route`）
 * - 流设置集中在 `streamSettings`
 * - 不支持 hysteria2 / tuic（Xray 内核没有这两个协议）
 */

/** 证书在节点本地的存放目录（Agent 负责写入） */
export const XRAY_CERT_DIR = '/etc/sparrow/certs'

/** Xray 内核不支持的协议 */
const XRAY_UNSUPPORTED_PROTOCOLS: NodeProtocol[] = ['hysteria2', 'tuic']

/** 生成 Xray 用户（client）列表 */
export function buildXrayClients(
  node: NodeRenderInput,
  rules: CoreUserRule[] = []
): Array<Record<string, unknown>> {
  const clients: Array<Record<string, unknown>> = []

  for (const rule of rules) {
    if (!rule.enabled) {
      continue
    }

    switch (node.protocol) {
      case 'vless': {
        if (!node.uuid) {
          continue
        }
        const client: Record<string, unknown> = { id: node.uuid, email: rule.email, level: 0 }
        if (node.flow) {
          client.flow = node.flow
        }
        clients.push(client)
        break
      }
      case 'vmess': {
        if (!node.uuid) {
          continue
        }
        clients.push({
          id: node.uuid,
          email: rule.email,
          level: 0,
          alterId: 0,
          security: node.security || 'auto'
        })
        break
      }
      case 'trojan': {
        if (!node.password) {
          continue
        }
        clients.push({ password: node.password, email: rule.email, level: 0 })
        break
      }
      case 'shadowsocks': {
        if (!node.password) {
          continue
        }
        clients.push({ password: node.password, email: rule.email, level: 0 })
        break
      }
      default:
        continue
    }
  }

  return clients
}

/** 生成 Xray 的 TLS 段 */
export function buildXrayTls(
  node: NodeRenderInput,
  certificates: Array<CoreCertificate & { id?: string }> = []
): Record<string, unknown> | null {
  if (node.tlsMode === 'none') {
    return null
  }

  if (node.tlsMode === 'reality') {
    const reality: Record<string, unknown> = {
      publicKey: node.realityPublicKey ?? '',
      shortIds: node.realityShortId ? [node.realityShortId] : [],
      serverName: node.sni || node.host
    }
    if (node.fingerprint) {
      reality.fingerprint = node.fingerprint
    }
    return reality
  }

  const tls: Record<string, unknown> = {
    serverName: node.sni || node.host,
    alpn: node.alpn ?? [],
    allowInsecure: node.allowInsecure ?? false
  }

  const certificate = node.certificateId
    ? certificates.find(c => (c.id && c.id === node.certificateId) || c.name === node.certificateId)
    : undefined

  if (certificate) {
    const base = safeFileName(certificate.name)
    tls.certificates = [
      {
        certificateFile: `${XRAY_CERT_DIR}/${base}.crt`,
        keyFile: `${XRAY_CERT_DIR}/${base}.key`
      }
    ]
  }

  return tls
}

/** 生成 Xray 的 streamSettings 段 */
export function buildXrayStreamSettings(
  node: NodeRenderInput,
  certificates: Array<CoreCertificate & { id?: string }> = []
): Record<string, unknown> {
  const stream: Record<string, unknown> = {
    network: node.network,
    security: node.tlsMode
  }

  const host = node.hostHeader || node.host

  switch (node.network) {
    case 'ws': {
      const settings: Record<string, unknown> = {}
      if (node.path) {
        settings.path = node.path
      }
      settings.headers = { Host: host }
      stream.wsSettings = settings
      break
    }
    case 'grpc': {
      stream.grpcSettings = {
        serviceName: node.path ?? '',
        multiMode: false,
        authority: host
      }
      break
    }
    case 'http': {
      const settings: Record<string, unknown> = {}
      if (node.path) {
        settings.path = node.path
      }
      settings.host = [host]
      stream.httpSettings = settings
      break
    }
    case 'quic': {
      stream.quicSettings = {
        security: 'none',
        key: '',
        header: { type: 'none' }
      }
      break
    }
    case 'kcp': {
      stream.kcpSettings = {
        mtu: 1350,
        tti: 50,
        uplinkCapacity: 5,
        downlinkCapacity: 20,
        congestion: false,
        readBufferSize: 2,
        writeBufferSize: 2,
        header: { type: 'none' },
        seed: ''
      }
      break
    }
    case 'tcp':
    default: {
      stream.tcpSettings = { header: { type: 'none' } }
      break
    }
  }

  if (node.tlsMode === 'tls') {
    const tls = buildXrayTls(node, certificates)
    if (tls) {
      stream.tlsSettings = tls
    }
  } else if (node.tlsMode === 'reality') {
    const reality = buildXrayTls(node, certificates)
    if (reality) {
      stream.realitySettings = reality
    }
  }

  return stream
}

/** 生成 Xray 入站 */
export function buildXrayInbound(
  node: NodeRenderInput,
  rules: CoreUserRule[] = [],
  certificates: Array<CoreCertificate & { id?: string }> = []
): Record<string, unknown> {
  if (XRAY_UNSUPPORTED_PROTOCOLS.includes(node.protocol)) {
    throw new NodeRenderError(
      `Xray 内核不支持协议 ${node.protocol}`,
      'NODE_PROTOCOL_UNSUPPORTED'
    )
  }

  const listenPort = node.serverPort ?? node.port

  const settings: Record<string, unknown> = {
    clients: buildXrayClients(node, rules)
  }

  if (node.protocol === 'vless') {
    settings.decryption = 'none'
  }

  if (node.protocol === 'shadowsocks') {
    settings.method = node.method || 'aes-128-gcm'
  }

  return {
    tag: `inbound-${listenPort}`,
    listen: '0.0.0.0',
    port: listenPort,
    protocol: node.protocol,
    settings,
    streamSettings: buildXrayStreamSettings(node, certificates),
    sniffing: {
      enabled: true,
      destOverride: ['http', 'tls', 'quic']
    }
  }
}

/** 生成 Xray 出站 */
export function buildXrayOutbounds(): Array<Record<string, unknown>> {
  return [
    { protocol: 'freedom', tag: 'direct' },
    { protocol: 'blackhole', tag: 'block' }
  ]
}

/** 生成 Xray 路由 */
export function buildXrayRouting(): Record<string, unknown> {
  return {
    domainStrategy: 'IPIfNonMatch',
    rules: [
      { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
      { type: 'field', protocol: ['bittorrent'], outboundTag: 'block' }
    ]
  }
}

/** 生成 Xray 策略（开启用户级流量统计，Agent 通过 gRPC 读取） */
export function buildXrayPolicy(): Record<string, unknown> {
  return {
    levels: {
      0: {
        statsUserUplink: true,
        statsUserDownlink: true,
        bufferSize: 4
      }
    },
    system: {
      statsInboundUplink: true,
      statsInboundDownlink: true
    }
  }
}

/** 生成 Xray DNS */
export function buildXrayDns(): Record<string, unknown> {
  return {
    servers: ['1.1.1.1', '8.8.8.8', 'localhost']
  }
}

/**
 * 渲染 Xray 内核配置。
 *
 * @param node 节点定义
 * @param rules 下发给该节点的用户规则（`email` 为内核标签）
 * @param certificates 该节点可用的证书
 */
export function renderXrayConfig(
  node: NodeRenderInput,
  rules: CoreUserRule[] = [],
  certificates: Array<CoreCertificate & { id?: string }> = []
): CoreConfig {
  return {
    log: {
      loglevel: 'info'
    },
    inbounds: [buildXrayInbound(node, rules, certificates)],
    outbounds: buildXrayOutbounds(),
    routing: buildXrayRouting(),
    dns: buildXrayDns(),
    policy: buildXrayPolicy()
  }
}
