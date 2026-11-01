import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeCertificates, subscriptions, users } from '@/lib/db/schema'
import type { AgentNode } from './auth'

/** 面板要求的最低 Agent 版本（心跳/配置下发都会带上） */
export const MIN_AGENT_VERSION = '1.0.0'

/**
 * 订阅 → 节点内核用户 uid。
 * 用 sha256 派生，保证同一订阅在面板与内核侧稳定一致（Go Agent 不需要知道映射规则，
 * 只需要按 uid 上报流量，面板反查）。
 */
export function subscriptionUid(subscriptionId: string) {
  const digest = createHash('sha256').update(`sub:${subscriptionId}`).digest()
  return (digest.readUInt32BE(0) % 900_000) + 1000
}

export interface NodeConfigUser {
  email: string
  uid: number
  limit: number
  downloadSpeed: number
  uploadSpeed: number
}

/** 该节点可承载的在线订阅用户（简化：全部 active 订阅） */
export async function loadNodeUsers(): Promise<NodeConfigUser[]> {
  const rows = await db
    .select({
      id: subscriptions.id,
      trafficLimit: subscriptions.trafficLimit,
      trafficUsed: subscriptions.trafficUsed,
      speedLimitMbps: subscriptions.speedLimitMbps,
      email: users.email
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(eq(subscriptions.status, 'active'), gt(subscriptions.expireAt, new Date())))

  return rows.map((row) => {
    const limit = Number(row.trafficLimit)
    const used = Number(row.trafficUsed)
    return {
      email: row.email,
      uid: subscriptionUid(row.id),
      limit: limit > 0 ? Math.max(limit - used, 0) : 0,
      downloadSpeed: row.speedLimitMbps,
      uploadSpeed: row.speedLimitMbps
    }
  })
}

async function loadNodeCertificates(node: AgentNode) {
  if (!node.certificateId) return []
  const rows = await db
    .select({ name: nodeCertificates.name, cert: nodeCertificates.cert, key: nodeCertificates.key })
    .from(nodeCertificates)
    .where(eq(nodeCertificates.id, node.certificateId))
    .limit(1)
  return rows
}

/**
 * sing-box 内核配置骨架：只把 nodes 字段拼到 inbound，够后续 Go Agent 对齐；
 * 不追求协议参数完备（出站、路由规则等留给后续任务）。
 */
export async function buildNodeConfig(node: AgentNode) {
  const [rulesUsers, certificates] = await Promise.all([
    loadNodeUsers(),
    loadNodeCertificates(node)
  ])

  const inbound: Record<string, unknown> = {
    type: node.protocol,
    tag: `in-${node.name}`,
    listen: '::',
    listen_port: node.serverPort ?? node.port,
    transport:
      node.network === 'tcp'
        ? undefined
        : {
            type: node.network,
            path: node.network === 'grpc' ? undefined : node.path ?? undefined,
            service_name: node.network === 'grpc' ? node.path ?? undefined : undefined,
            host: node.network === 'http' ? (node.hostHeader ?? node.host) : undefined
          },
    users: rulesUsers.map((user) => ({
      name: user.email,
      email: user.email,
      uid: user.uid
    }))
  }

  if (node.tlsMode === 'reality') {
    inbound.tls = {
      enabled: true,
      server_name: node.sni ?? node.host,
      reality: {
        enabled: true,
        handshake: { server: node.sni ?? node.host, server_port: 443 },
        private_key: '',
        short_id: node.realityShortId ?? ''
      }
    }
  } else if (node.tlsMode === 'tls') {
    inbound.tls = {
      enabled: true,
      server_name: node.sni ?? node.host,
      alpn: node.alpn.length > 0 ? node.alpn : ['h2', 'http/1.1'],
      certificate_path: certificates[0] ? `/etc/sparrow/certs/${node.certificateId}.pem` : undefined,
      key_path: certificates[0] ? `/etc/sparrow/certs/${node.certificateId}.key` : undefined
    }
  }

  return {
    version: node.configVersion,
    core: node.core,
    config: {
      log: { level: 'info', timestamp: true },
      inbounds: [inbound],
      outbounds: [{ type: 'direct', tag: 'direct' }],
      route: { final: 'direct' }
    },
    rules: { users: rulesUsers },
    certificates: certificates.map((cert) => ({ name: cert.name, cert: cert.cert, key: cert.key })),
    reload: true
  }
}

/** 流量上报时 uid → 订阅/用户反查（订阅量小，直接全量扫描派生） */
export async function resolveUids(uids: number[]) {
  if (uids.length === 0) return new Map<number, { subscriptionId: string; userId: string }>()
  const all = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
  const map = new Map<number, { subscriptionId: string; userId: string }>()
  for (const row of all) {
    const uid = subscriptionUid(row.id)
    if (uids.includes(uid)) map.set(uid, { subscriptionId: row.id, userId: row.userId })
  }
  return map
}
