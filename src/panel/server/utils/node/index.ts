import type { CoreCertificate, CoreConfig, CoreUserRule, Node, NodeGroup } from '@sparrow/contracts'
import type { H3Event } from 'h3'
import type { ZodType } from 'zod'
import { X509Certificate } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { nodeCertificates, nodeGroups, nodes } from '../../../drizzle/schema'
import { renderSingBoxConfig } from './config-singbox'
import { renderXrayConfig } from './config-xray'

/**
 * 节点域的服务端公共逻辑：DTO 映射、配置渲染入口、请求解析。
 *
 * 敏感信息（REALITY 私钥、节点密钥、证书私钥）**永远不返回给前端**，
 * 详见 `toNodeDto` / `toCertificateDto`。
 */

export * from './config-singbox'
export * from './config-xray'
export * from './signature'

/** 内核类型 */
export type CoreType = 'sing-box' | 'xray'

/** 敏感值占位符（前端据此提示「已设置，未回显」） */
export const SECRET_MASK = '********'

/** 节点表行类型 */
export type NodeRow = typeof nodes.$inferSelect

/** 节点组表行类型 */
export type NodeGroupRow = typeof nodeGroups.$inferSelect

/** 证书表行类型 */
export type NodeCertificateRow = typeof nodeCertificates.$inferSelect

/**
 * 脱敏：证书私钥等敏感字段一律返回 `null`，
 * 由前端根据 `hasKey` 之类的布尔位提示「已配置」。
 */
export function maskSecret(value: string | null | undefined): string | null {
  return value ? SECRET_MASK : null
}

/**
 * 节点 DTO。
 *
 * 只输出契约 `NodeSchema` 的字段——数据库里的 `privateKey` / `publicKey` /
 * `realitySpiderX` / `extra` 一律不外泄。
 */
export function toNodeDto(row: NodeRow, groupName?: string | null): Node {
  return {
    id: row.id,
    name: row.name,
    groupId: row.groupId,
    groupName: groupName ?? null,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    serverPort: row.serverPort,
    network: row.network,
    path: row.path,
    hostHeader: row.hostHeader,
    method: row.method,
    flow: row.flow,
    password: row.password,
    uuid: row.uuid,
    security: row.security,
    tlsMode: row.tlsMode,
    sni: row.sni,
    alpn: row.alpn ?? [],
    allowInsecure: row.allowInsecure,
    realityPublicKey: row.realityPublicKey,
    realityShortId: row.realityShortId,
    fingerprint: row.fingerprint,
    certificateId: row.certificateId,
    trafficRate: Number(row.trafficRate),
    priority: row.priority,
    weight: row.weight,
    status: row.status,
    isRelay: row.isRelay,
    sort: row.sort,
    remark: row.remark,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  }
}

/** 节点组 DTO */
export function toNodeGroupDto(
  row: NodeGroupRow,
  counts?: { nodeCount?: number, onlineCount?: number }
): NodeGroup {
  return {
    id: row.id,
    name: row.name,
    sort: row.sort,
    region: row.region,
    remark: row.remark,
    nodeCount: counts?.nodeCount,
    onlineCount: counts?.onlineCount
  }
}

/** 证书 DTO（私钥脱敏） */
export interface CertificateDto {
  id: string
  name: string
  type: string
  source: string
  /** PEM 证书（公钥部分，可回显） */
  cert: string
  /** 私钥：始终为 null（不回显） */
  key: string | null
  /** 是否已配置私钥 */
  hasKey: boolean
  issuer: string | null
  notBefore: string | null
  notAfter: string | null
  /** 距离到期天数；null 表示未知 */
  daysRemaining: number | null
  expired: boolean
  expiringSoon: boolean
  createdAt: string
  updatedAt: string
}

/** 临期阈值：30 天 */
export const CERTIFICATE_EXPIRING_DAYS = 30

/**
 * 从 PEM 中解析签发者与有效期（解析失败时返回空对象，不阻断保存）。
 */
export function inspectCertificate(pem: string): { issuer?: string, notBefore?: Date, notAfter?: Date } {
  try {
    const x509 = new X509Certificate(pem)
    return {
      issuer: x509.issuer,
      notBefore: new Date(x509.validFrom),
      notAfter: new Date(x509.validTo)
    }
  } catch {
    return {}
  }
}

/** 证书 DTO */
export function toCertificateDto(row: NodeCertificateRow, now: number = Date.now()): CertificateDto {
  const notAfter = row.notAfter ? row.notAfter.getTime() : null
  const daysRemaining = notAfter === null ? null : Math.ceil((notAfter - now) / 86_400_000)

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    source: row.source,
    cert: row.cert,
    key: maskSecret(row.key),
    hasKey: Boolean(row.key),
    issuer: row.issuer,
    notBefore: row.notBefore ? row.notBefore.toISOString() : null,
    notAfter: row.notAfter ? row.notAfter.toISOString() : null,
    daysRemaining,
    expired: daysRemaining !== null && daysRemaining < 0,
    expiringSoon: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= CERTIFICATE_EXPIRING_DAYS,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

/** 渲染内核配置（按内核类型分发） */
export function renderCoreConfig(
  core: CoreType,
  node: Parameters<typeof renderSingBoxConfig>[0],
  rules: CoreUserRule[] = [],
  certificates: CoreCertificate[] = []
): CoreConfig {
  if (core === 'xray') {
    return renderXrayConfig(node, rules, certificates)
  }
  return renderSingBoxConfig(node, rules, certificates)
}

/** 解析查询参数，失败统一抛 422 */
export async function parseQuery<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  const query = getQuery(event)
  const result = schema.safeParse(query)

  if (!result.success) {
    throw createError({
      statusCode: 422,
      statusMessage: 'VALIDATION_FAILED',
      message: '参数校验失败',
      data: {
        code: 'VALIDATION_FAILED',
        message: '参数校验失败',
        issues: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }
    })
  }

  return result.data
}

/** 构造分页元信息 */
export function buildPaginationMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    nextCursor: null as string | null
  }
}

/** 路径参数（非空字符串） */
export function getPathParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!value) {
    throw createError({
      statusCode: 400,
      statusMessage: 'VALIDATION_FAILED',
      message: `缺少路径参数 ${name}`,
      data: { code: 'VALIDATION_FAILED', message: `缺少路径参数 ${name}` }
    })
  }
  return value
}

/** 按 ID 读取节点，不存在则抛 404 */
export async function loadNodeRow(id: string): Promise<NodeRow> {
  const db = useDb()
  const [row] = await db.select().from(nodes).where(eq(nodes.id, id)).limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'NODE_NOT_FOUND',
      message: '节点不存在',
      data: { code: 'NODE_NOT_FOUND', message: '节点不存在' }
    })
  }

  return row
}

/** 按 ID 读取节点组，不存在则抛 404 */
export async function loadNodeGroupRow(id: string): Promise<NodeGroupRow> {
  const db = useDb()
  const [row] = await db.select().from(nodeGroups).where(eq(nodeGroups.id, id)).limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'NODE_GROUP_NOT_FOUND',
      message: '节点组不存在',
      data: { code: 'NODE_GROUP_NOT_FOUND', message: '节点组不存在' }
    })
  }

  return row
}

/** 按 ID 读取证书，不存在则抛 404 */
export async function loadCertificateRow(id: string): Promise<NodeCertificateRow> {
  const db = useDb()
  const [row] = await db.select().from(nodeCertificates).where(eq(nodeCertificates.id, id)).limit(1)

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'NODE_CERT_NOT_FOUND',
      message: '证书不存在',
      data: { code: 'NODE_CERT_NOT_FOUND', message: '证书不存在' }
    })
  }

  return row
}
