import type { CoreCertificate, CoreConfig, CoreUserRule, NodeProtocol, NodeTlsMode, NodeTransport } from '@sparrow/contracts'

/**
 * sing-box 内核配置渲染。
 *
 * 纯函数：不查库、不读环境变量，输入相同则输出相同（便于快照测试）。
 *
 * 目标内核版本：sing-box 1.11+（`dns.servers` 使用 legacy `address` 写法，
 * 在 1.12 中仍兼容；`transport` / `tls` 字段与 1.11 一致）。
 */

/** 证书在节点本地的存放目录（Agent 负责写入） */
export const SINGBOX_CERT_DIR = '/etc/sparrow/certs'

/** 渲染所需的节点字段（与契约 `Node` 结构兼容） */
export interface NodeRenderInput {
  id: string
  name: string
  protocol: NodeProtocol
  host: string
  port: number
  serverPort?: number | null
  network: NodeTransport
  path?: string | null
  hostHeader?: string | null
  method?: string | null
  flow?: string | null
  password?: string | null
  uuid?: string | null
  security?: string | null
  tlsMode: NodeTlsMode
  sni?: string | null
  alpn?: string[]
  allowInsecure?: boolean
  realityPublicKey?: string | null
  realityShortId?: string | null
  fingerprint?: string | null
  certificateId?: string | null
}

/** 渲染所需的证书（契约 `CoreCertificate` + 可选的数据库 ID） */
export type RenderCertificate = CoreCertificate & { id?: string }

/** 渲染失败（协议不被目标内核支持等） */
export class NodeRenderError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message)
    this.name = 'NodeRenderError'
  }
}

/** 文件名安全化：只保留字母数字与 `-_.` */
export function safeFileName(name: string): string {
  return (name || 'certificate')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'certificate'
}

/** 找出节点绑定的证书 */
export function findNodeCertificate(
  node: NodeRenderInput,
  certificates: RenderCertificate[] = []
): RenderCertificate | undefined {
  if (!node.certificateId) {
    return undefined
  }
  return certificates.find(certificate =>
    (certificate.id && certificate.id === node.certificateId)
    || certificate.name === node.certificateId
  )
}

/** sing-box 内核不支持的传输方式 */
const SINGBOX_UNSUPPORTED_TRANSPORTS: NodeTransport[] = ['kcp']

/**
 * 生成 sing-box 用户列表。
 *
 * 说明：契约中的 `CoreUserRule` 不携带用户凭据，凭据来自节点本身
 * （`node.uuid` / `node.password`），`email` 是内核里的用户标签，
 * 用于流量回传时关联面板用户（`uid`）。
 */
export function buildSingBoxUsers(
  node: NodeRenderInput,
  rules: CoreUserRule[] = []
): Array<Record<string, unknown>> {
  const users: Array<Record<string, unknown>> = []

  for (const rule of rules) {
    if (!rule.enabled) {
      continue
    }

    switch (node.protocol) {
      case 'vless': {
        if (!node.uuid) {
          continue
        }
        const user: Record<string, unknown> = { name: rule.email, uuid: node.uuid }
        if (node.flow) {
          user.flow = node.flow
        }
        users.push(user)
        break
      }
      case 'vmess': {
        if (!node.uuid) {
          continue
        }
        users.push({
          name: rule.email,
          uuid: node.uuid,
          alterId: 0,
          security: node.security || 'auto'
        })
        break
      }
      case 'trojan':
      case 'hysteria2': {
        if (!node.password) {
          continue
        }
        users.push({ name: rule.email, password: node.password })
        break
      }
      case 'shadowsocks': {
        if (!node.password) {
          continue
        }
        users.push({ name: rule.email, password: node.password })
        break
      }
      case 'tuic': {
        if (!node.uuid || !node.password) {
          continue
        }
        users.push({ name: rule.email, uuid: node.uuid, password: node.password })
        break
      }
    }
  }

  return users
}

/** 生成 sing-box 的 TLS 段 */
export function buildSingBoxTls(
  node: NodeRenderInput,
  certificates: RenderCertificate[] = []
): Record<string, unknown> | null {
  if (node.tlsMode === 'none') {
    return null
  }

  const tls: Record<string, unknown> = {
    enabled: true,
    server_name: node.sni || node.host,
    alpn: node.alpn ?? [],
    insecure: node.allowInsecure ?? false
  }

  if (node.tlsMode === 'reality') {
    tls.reality = {
      enabled: true,
      public_key: node.realityPublicKey ?? '',
      short_id: node.realityShortId ?? ''
    }
    if (node.fingerprint) {
      tls.utls = { enabled: true, fingerprint: node.fingerprint }
    }
    return tls
  }

  const certificate = findNodeCertificate(node, certificates)
  if (certificate) {
    const base = safeFileName(certificate.name)
    tls.certificate_path = `${SINGBOX_CERT_DIR}/${base}.crt`
    tls.key_path = `${SINGBOX_CERT_DIR}/${base}.key`
  }

  return tls
}

/** 生成 sing-box 的 transport 段 */
export function buildSingBoxTransport(node: NodeRenderInput): Record<string, unknown> | null {
  if (SINGBOX_UNSUPPORTED_TRANSPORTS.includes(node.network)) {
    return null
  }

  const host = node.hostHeader || node.host

  switch (node.network) {
    case 'tcp':
      return null
    case 'ws': {
      const transport: Record<string, unknown> = { type: 'ws' }
      if (node.path) {
        transport.path = node.path
      }
      transport.headers = { Host: host }
      return transport
    }
    case 'grpc': {
      const transport: Record<string, unknown> = { type: 'grpc' }
      if (node.path) {
        transport.service_name = node.path
      }
      return transport
    }
    case 'http': {
      const transport: Record<string, unknown> = { type: 'http' }
      if (node.path) {
        transport.path = node.path
      }
      transport.host = [host]
      return transport
    }
    case 'quic':
      return { type: 'quic' }
    default:
      return null
  }
}

/** 生成 sing-box 入站 */
export function buildSingBoxInbound(
  node: NodeRenderInput,
  rules: CoreUserRule[] = [],
  certificates: RenderCertificate[] = []
): Record<string, unknown> {
  const listenPort = node.serverPort ?? node.port

  const inbound: Record<string, unknown> = {
    type: node.protocol,
    tag: `inbound-${listenPort}`,
    listen: '::',
    listen_port: listenPort,
    users: buildSingBoxUsers(node, rules)
  }

  if (node.protocol === 'shadowsocks') {
    inbound.method = node.method || 'aes-128-gcm'
  }

  if (node.protocol === 'tuic') {
    inbound.congestion_control = 'bbr'
    inbound.udp_relay_mode = 'native'
  }

  const tls = buildSingBoxTls(node, certificates)
  if (tls) {
    inbound.tls = tls
  }

  const transport = buildSingBoxTransport(node)
  if (transport) {
    inbound.transport = transport
  }

  return inbound
}

/** 生成 sing-box 出站 */
export function buildSingBoxOutbounds(): Array<Record<string, unknown>> {
  return [
    { type: 'direct', tag: 'direct' },
    { type: 'block', tag: 'block' }
  ]
}

/** 生成 sing-box 路由 */
export function buildSingBoxRoute(): Record<string, unknown> {
  return {
    rules: [
      { protocol: 'bittorrent', outbound: 'block' },
      { ip_is_private: true, outbound: 'direct' }
    ],
    final: 'direct',
    auto_detect_interface: true
  }
}

/** 生成 sing-box DNS */
export function buildSingBoxDns(): Record<string, unknown> {
  return {
    servers: [
      { tag: 'remote', address: 'https://1.1.1.1/dns-query', detour: 'direct' },
      { tag: 'local', address: 'local', detour: 'direct' }
    ],
    rules: [],
    final: 'remote'
  }
}

/**
 * 渲染 sing-box 内核配置。
 *
 * @param node 节点定义
 * @param rules 下发给该节点的用户规则（`email` 为内核标签）
 * @param certificates 该节点可用的证书
 */
export function renderSingBoxConfig(
  node: NodeRenderInput,
  rules: CoreUserRule[] = [],
  certificates: RenderCertificate[] = []
): CoreConfig {
  return {
    log: {
      level: 'info',
      timestamp: true
    },
    inbounds: [buildSingBoxInbound(node, rules, certificates)],
    outbounds: buildSingBoxOutbounds(),
    route: buildSingBoxRoute(),
    dns: buildSingBoxDns()
  }
}
