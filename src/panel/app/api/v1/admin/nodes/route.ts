import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeGroups, nodeHeartbeats, nodes } from '@/lib/db/schema'
import { created, list, route, ApiError } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { nodeInputSchema } from '@/lib/api/schemas'
import { nodeQuerySchema } from '@/lib/api/node-schemas'
import { toAdminNode } from '@/lib/api/node-record'
import { createRegistrationToken } from '@/lib/agent/secret'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:node:read')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const query = nodeQuerySchema.parse(params)

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
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(nodes)
      .where(where)
  ])

  const total = counted?.total ?? 0

  return list(
    rows.map((row) =>
      toAdminNode(row.node, { name: row.groupName, region: row.groupRegion }, row.heartbeat)
    ),
    {
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: offset + rows.length < total
    }
  )
})

export const POST = route(async (req: Request) => {
  await requireApiSession('admin:node:write')

  const body = nodeInputSchema.parse(await req.json())

  const [group] = await db
    .select({ id: nodeGroups.id, name: nodeGroups.name, region: nodeGroups.region })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, body.groupId))
    .limit(1)
  if (!group) throw new ApiError(422, 'NODE_GROUP_NOT_FOUND', '节点组不存在', { field: 'groupId' })

  const [duplicated] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.host, body.host), eq(nodes.port, body.port)))
    .limit(1)
  if (duplicated) {
    throw new ApiError(409, 'NODE_DUPLICATED', '该地址与端口已被其他节点占用', {
      field: 'host'
    })
  }

  const [node] = await db
    .insert(nodes)
    .values({
      name: body.name,
      groupId: body.groupId,
      protocol: body.protocol,
      host: body.host,
      port: body.port,
      network: body.network,
      tlsMode: body.tlsMode,
      sni: body.sni ?? null,
      path: body.path ?? null,
      trafficRate: body.trafficRate.toFixed(2),
      status: body.status,
      remark: body.remark ?? null
    })
    .returning()

  const [row] = await db
    .select({ node: nodes, heartbeat: nodeHeartbeats })
    .from(nodes)
    .leftJoin(nodeHeartbeats, eq(nodeHeartbeats.nodeId, nodes.id))
    .where(eq(nodes.id, node.id))
    .limit(1)

  return created({
    ...toAdminNode(row!.node, group, row!.heartbeat),
    registrationToken: createRegistrationToken(node.id)
  })
})
