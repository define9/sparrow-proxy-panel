import 'server-only'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { ApiError, type ListMeta } from '@/lib/api/response'
import { daysUntil, parseCertificateValidity } from '@/lib/api/cert'
import { toAdminNode, type AdminNodeRecord } from '@/lib/api/node-record'
import type {
  certificateInputSchema,
  nodeGroupInputSchema,
  nodeGroupUpdateSchema,
  nodeQuerySchema,
  nodeUpdateSchema
} from '@/lib/api/node-schemas'
import type { nodeInputSchema } from '@/lib/api/schemas'
import { createRegistrationToken } from '@/lib/agent/secret'
import { db } from '@/lib/db'
import {
  agentCommands,
  agentEvents,
  nodeCertificates,
  nodeGroups,
  nodeHeartbeats,
  nodes
} from '@/lib/db/schema'

/**
 * 节点 / 节点组 / 节点证书服务层。
 *
 * route 只做鉴权与参数校验，列表筛选、唯一性校验、DTO 组装、命令落库都在这里，
 * 页面（RSC）与 Agent 侧接口可以复用同一套查询。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type NodeQuery = z.infer<typeof nodeQuerySchema>
type NodeInput = z.infer<typeof nodeInputSchema>
type NodeUpdate = z.infer<typeof nodeUpdateSchema>
type NodeGroupInput = z.infer<typeof nodeGroupInputSchema>
type NodeGroupUpdate = z.infer<typeof nodeGroupUpdateSchema>
type CertificateInput = z.infer<typeof certificateInputSchema>
type CertificateRow = typeof nodeCertificates.$inferSelect

function assertUuid(id: string, code: string, message: string) {
  if (!UUID_RE.test(id)) throw new ApiError(404, code, message)
  return id
}

/* --------------------------------- 节点 ---------------------------------- */

export interface NodeListResult {
  data: AdminNodeRecord[]
  meta: ListMeta
}

export interface AdminNodeDetail extends AdminNodeRecord {
  registrationToken: string | null
  events: AgentEventDto[]
  commands: AgentCommandDto[]
}

export interface AgentEventDto {
  id: string
  type: string
  level: string
  message: string | null
  payload: string | null
  createdAt: string
}

export interface AgentCommandDto {
  id: string
  command: string
  payload: string | null
  status: string
  issuedAt: string
  finishedAt: string | null
  result: string | null
}

function toAgentEvent(row: typeof agentEvents.$inferSelect): AgentEventDto {
  return {
    id: row.id,
    type: row.type,
    level: row.level,
    message: row.message,
    payload: row.payload,
    createdAt: row.createdAt.toISOString()
  }
}

function toAgentCommand(row: typeof agentCommands.$inferSelect): AgentCommandDto {
  return {
    id: row.id,
    command: row.command,
    payload: row.payload,
    status: row.status,
    issuedAt: row.issuedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    result: row.result
  }
}

/** 列表：按关键字 / 节点组 / 状态筛选，附带节点组与心跳 */
export async function listNodes(query: NodeQuery): Promise<NodeListResult> {
  const conditions = []
  if (query.q) {
    const keyword = `%${query.q}%`
    conditions.push(or(ilike(nodes.name, keyword), ilike(nodes.host, keyword)))
  }
  if (query.groupId) conditions.push(eq(nodes.groupId, query.groupId))
  if (query.status) conditions.push(eq(nodes.status, query.status))
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const offset = (query.page - 1) * query.pageSize

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        node: nodes,
        groupName: nodeGroups.name,
        groupRegion: nodeGroups.region,
        heartbeat: nodeHeartbeats
      })
      .from(nodes)
      .innerJoin(nodeGroups, eq(nodeGroups.id, nodes.groupId))
      .leftJoin(nodeHeartbeats, eq(nodeHeartbeats.nodeId, nodes.id))
      .where(where)
      .orderBy(asc(nodes.sort), asc(nodes.name))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(nodes).where(where)
  ])

  const total = counted?.total ?? 0

  return {
    data: rows.map((row) =>
      toAdminNode(row.node, { name: row.groupName, region: row.groupRegion }, row.heartbeat)
    ),
    meta: {
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: offset + rows.length < total
    }
  }
}

/** 详情：节点本身 + 最近 5 条事件 + 最近 3 条命令 */
export async function getNode(id: string): Promise<AdminNodeDetail> {
  assertUuid(id, 'NODE_NOT_FOUND', '节点不存在')

  const [row] = await db
    .select({
      node: nodes,
      heartbeat: nodeHeartbeats,
      groupName: nodeGroups.name,
      groupRegion: nodeGroups.region
    })
    .from(nodes)
    .innerJoin(nodeGroups, eq(nodeGroups.id, nodes.groupId))
    .leftJoin(nodeHeartbeats, eq(nodeHeartbeats.nodeId, nodes.id))
    .where(eq(nodes.id, id))
    .limit(1)

  if (!row) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')

  const [events, commands] = await Promise.all([
    db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.nodeId, id))
      .orderBy(desc(agentEvents.createdAt))
      .limit(5),
    db
      .select()
      .from(agentCommands)
      .where(eq(agentCommands.nodeId, id))
      .orderBy(desc(agentCommands.issuedAt))
      .limit(3)
  ])

  return {
    ...toAdminNode(
      row.node,
      { name: row.groupName, region: row.groupRegion },
      row.heartbeat
    ),
    registrationToken: row.node.agentSecretHash ? null : createRegistrationToken(id),
    events: events.map(toAgentEvent),
    commands: commands.map(toAgentCommand)
  }
}

/** 创建：校验节点组存在、host+port 唯一，响应里带一次性注册令牌 */
export async function createNode(
  input: NodeInput
): Promise<AdminNodeRecord & { registrationToken: string }> {
  const [group] = await db
    .select({ id: nodeGroups.id, name: nodeGroups.name, region: nodeGroups.region })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, input.groupId))
    .limit(1)
  if (!group) throw new ApiError(422, 'NODE_GROUP_NOT_FOUND', '节点组不存在', { field: 'groupId' })

  const [duplicated] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.host, input.host), eq(nodes.port, input.port)))
    .limit(1)
  if (duplicated) {
    throw new ApiError(409, 'NODE_DUPLICATED', '该地址与端口已被其他节点占用', { field: 'host' })
  }

  const [node] = await db
    .insert(nodes)
    .values({
      name: input.name,
      groupId: input.groupId,
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      network: input.network,
      tlsMode: input.tlsMode,
      sni: input.sni ?? null,
      path: input.path ?? null,
      trafficRate: input.trafficRate.toFixed(2),
      status: input.status,
      remark: input.remark ?? null
    })
    .returning()

  const [row] = await db
    .select({ node: nodes, heartbeat: nodeHeartbeats })
    .from(nodes)
    .leftJoin(nodeHeartbeats, eq(nodeHeartbeats.nodeId, nodes.id))
    .where(eq(nodes.id, node!.id))
    .limit(1)

  return {
    ...toAdminNode(row!.node, group, row!.heartbeat),
    registrationToken: createRegistrationToken(node!.id)
  }
}

/** 更新：部分字段覆盖，切组时先校验目标组 */
export async function updateNode(
  _actorId: string,
  id: string,
  patch: NodeUpdate
): Promise<AdminNodeRecord> {
  assertUuid(id, 'NODE_NOT_FOUND', '节点不存在')

  const [existing] = await db.select({ id: nodes.id }).from(nodes).where(eq(nodes.id, id)).limit(1)
  if (!existing) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')

  if (patch.groupId) {
    const [group] = await db
      .select({ id: nodeGroups.id })
      .from(nodeGroups)
      .where(eq(nodeGroups.id, patch.groupId))
      .limit(1)
    if (!group) {
      throw new ApiError(422, 'NODE_GROUP_NOT_FOUND', '节点组不存在', { field: 'groupId' })
    }
  }

  const [node] = await db
    .update(nodes)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.groupId !== undefined && { groupId: patch.groupId }),
      ...(patch.protocol !== undefined && { protocol: patch.protocol }),
      ...(patch.host !== undefined && { host: patch.host }),
      ...(patch.port !== undefined && { port: patch.port }),
      ...(patch.network !== undefined && { network: patch.network }),
      ...(patch.tlsMode !== undefined && { tlsMode: patch.tlsMode }),
      ...(patch.sni !== undefined && { sni: patch.sni }),
      ...(patch.path !== undefined && { path: patch.path }),
      ...(patch.trafficRate !== undefined && { trafficRate: patch.trafficRate.toFixed(2) }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.weight !== undefined && { weight: patch.weight }),
      ...(patch.sort !== undefined && { sort: patch.sort }),
      ...(patch.remark !== undefined && { remark: patch.remark }),
      updatedAt: new Date()
    })
    .where(eq(nodes.id, id))
    .returning()

  const [group] = await db
    .select({ groupName: nodeGroups.name, groupRegion: nodeGroups.region })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, node!.groupId))
    .limit(1)

  return toAdminNode(
    node!,
    group ? { name: group.groupName, region: group.groupRegion } : { name: '', region: '' },
    null
  )
}

export async function deleteNode(_actorId: string, id: string): Promise<void> {
  assertUuid(id, 'NODE_NOT_FOUND', '节点不存在')

  const [deleted] = await db.delete(nodes).where(eq(nodes.id, id)).returning({ id: nodes.id })
  if (!deleted) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')
}

export interface SyncNodeResult {
  configVersion: number
  commandId: string
  commandStatus: string
  syncedAt: string
}

/** 下发配置：configVersion + 1 并写一条 reload_config 命令 */
export async function syncNode(_actorId: string, id: string): Promise<SyncNodeResult> {
  assertUuid(id, 'NODE_NOT_FOUND', '节点不存在')

  const [node] = await db
    .update(nodes)
    .set({ configVersion: sql`${nodes.configVersion} + 1`, updatedAt: new Date() })
    .where(eq(nodes.id, id))
    .returning({ id: nodes.id, configVersion: nodes.configVersion })

  if (!node) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')

  const [command] = await db
    .insert(agentCommands)
    .values({
      nodeId: id,
      command: 'reload_config',
      payload: JSON.stringify({ version: node.configVersion })
    })
    .returning({ id: agentCommands.id, status: agentCommands.status })

  return {
    configVersion: node.configVersion,
    commandId: command!.id,
    commandStatus: command!.status,
    syncedAt: new Date().toISOString()
  }
}

/* -------------------------------- 节点组 --------------------------------- */

export interface NodeGroupDto {
  id: string
  name: string
  region: string
  sort: number
  remark: string | null
  createdAt: string
  nodeCount: number
  onlineCount: number
  /** 目前没有探测数据，返回 null（前端显示 —） */
  avgLatency: null
}

/** 列表：附带每组的节点数 / 在线数 */
export async function listNodeGroups(): Promise<NodeGroupDto[]> {
  const rows = await db
    .select({
      id: nodeGroups.id,
      name: nodeGroups.name,
      region: nodeGroups.region,
      sort: nodeGroups.sort,
      remark: nodeGroups.remark,
      createdAt: nodeGroups.createdAt,
      nodeCount: sql<number>`count(${nodes.id})::int`,
      onlineCount: sql<number>`count(case when ${nodes.status} = 'online' then 1 end)::int`
    })
    .from(nodeGroups)
    .leftJoin(nodes, eq(nodes.groupId, nodeGroups.id))
    .groupBy(nodeGroups.id)
    .orderBy(asc(nodeGroups.sort), asc(nodeGroups.name))

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    avgLatency: null
  }))
}

export async function createNodeGroup(
  _actorId: string,
  input: NodeGroupInput
): Promise<NodeGroupDto> {
  const [group] = await db
    .insert(nodeGroups)
    .values({
      name: input.name,
      region: input.region,
      sort: input.sort,
      remark: input.remark ?? null
    })
    .returning()

  return {
    ...group!,
    createdAt: group!.createdAt.toISOString(),
    nodeCount: 0,
    onlineCount: 0,
    avgLatency: null
  }
}

export async function updateNodeGroup(
  _actorId: string,
  id: string,
  patch: NodeGroupUpdate
): Promise<Omit<NodeGroupDto, 'nodeCount' | 'onlineCount'>> {
  const [existing] = await db
    .select({ id: nodeGroups.id })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, id))
    .limit(1)
  if (!existing) throw new ApiError(404, 'NODE_GROUP_NOT_FOUND', '节点组不存在')

  const [group] = await db
    .update(nodeGroups)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.region !== undefined && { region: patch.region }),
      ...(patch.sort !== undefined && { sort: patch.sort }),
      ...(patch.remark !== undefined && { remark: patch.remark })
    })
    .where(eq(nodeGroups.id, id))
    .returning()

  return {
    ...group!,
    createdAt: group!.createdAt.toISOString(),
    avgLatency: null
  }
}

/* ------------------------------- 节点证书 -------------------------------- */

export interface CertificateDto {
  id: string
  name: string
  type: string
  issuer: string | null
  notBefore: string | null
  notAfter: string | null
  /** 前端用不到完整 PEM，只给到期信息 */
  daysLeft: number | null
  source: string
  autoRenew: boolean
  createdAt: string
}

export interface CertificateListResult {
  data: CertificateDto[]
  meta: { total: number; usageCount: number }
}

function toCertificateDto(row: CertificateRow): CertificateDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    issuer: row.issuer,
    notBefore: row.notBefore?.toISOString() ?? null,
    notAfter: row.notAfter?.toISOString() ?? null,
    daysLeft: daysUntil(row.notAfter),
    source: row.source,
    autoRenew: row.source === 'acme',
    createdAt: row.createdAt.toISOString()
  }
}

export async function listCertificates(): Promise<CertificateListResult> {
  const [rows, [bound]] = await Promise.all([
    db.select().from(nodeCertificates).orderBy(asc(nodeCertificates.notAfter)),
    db.select({ total: sql<number>`count(*)::int` }).from(nodes)
  ])

  return {
    data: rows.map(toCertificateDto),
    meta: { total: rows.length, usageCount: bound?.total ?? 0 }
  }
}

/** 创建：有效期优先用显式值，其次从 PEM 扫，最后 +90 天占位 */
export async function createCertificate(
  _actorId: string,
  input: CertificateInput
): Promise<CertificateDto> {
  const parsed = parseCertificateValidity(input.cert)
  const notBefore = input.notBefore ? new Date(input.notBefore) : parsed.notBefore ?? new Date()
  const notAfter = input.notAfter
    ? new Date(input.notAfter)
    : parsed.notAfter ?? new Date(Date.now() + 90 * 86_400_000)

  if (Number.isNaN(notBefore.getTime()) || Number.isNaN(notAfter.getTime())) {
    throw new ApiError(422, 'NODE_CERT_INVALID', '证书有效期解析失败', { field: 'notAfter' })
  }
  if (notAfter <= notBefore) {
    throw new ApiError(422, 'NODE_CERT_INVALID', '证书到期时间必须晚于生效时间', {
      field: 'notAfter'
    })
  }

  const [row] = await db
    .insert(nodeCertificates)
    .values({
      name: input.name,
      type: input.type,
      cert: input.cert,
      key: input.key,
      issuer: input.issuer ?? null,
      notBefore,
      notAfter,
      source: input.source
    })
    .returning()

  return toCertificateDto(row!)
}

export async function deleteCertificate(_actorId: string, id: string): Promise<void> {
  assertUuid(id, 'NODE_CERT_NOT_FOUND', '证书不存在')

  const [deleted] = await db
    .delete(nodeCertificates)
    .where(eq(nodeCertificates.id, id))
    .returning({ id: nodeCertificates.id })
  if (!deleted) throw new ApiError(404, 'NODE_CERT_NOT_FOUND', '证书不存在')
}
