import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeGroups, nodes } from '@/lib/db/schema'
import { ApiError, created, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { nodeGroupInputSchema, nodeGroupUpdateSchema } from '@/lib/api/node-schemas'

/**
 * 节点组列表：附带每组的节点数 / 在线数。
 * avgLatency 目前没有探测数据，返回 null（前端显示 —）。
 */
export const GET = route(async () => {
  await requireApiSession('admin:node:read')

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

  return ok({
    data: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      avgLatency: null
    }))
  })
})

export const POST = route(async (req: Request) => {
  await requireApiSession('admin:node:write')
  const body = nodeGroupInputSchema.parse(await req.json())

  const [group] = await db
    .insert(nodeGroups)
    .values({
      name: body.name,
      region: body.region,
      sort: body.sort,
      remark: body.remark ?? null
    })
    .returning()

  return created({
    ...group!,
    createdAt: group!.createdAt.toISOString(),
    nodeCount: 0,
    onlineCount: 0,
    avgLatency: null
  })
})

export const PATCH = route(async (req: Request) => {
  await requireApiSession('admin:node:write')
  const body = nodeGroupUpdateSchema.parse(await req.json())

  const [existing] = await db
    .select({ id: nodeGroups.id })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, body.id))
    .limit(1)
  if (!existing) throw new ApiError(404, 'NODE_GROUP_NOT_FOUND', '节点组不存在')

  const [group] = await db
    .update(nodeGroups)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.region !== undefined && { region: body.region }),
      ...(body.sort !== undefined && { sort: body.sort }),
      ...(body.remark !== undefined && { remark: body.remark })
    })
    .where(eq(nodeGroups.id, body.id))
    .returning()

  return ok({
    ...group!,
    createdAt: group!.createdAt.toISOString(),
    avgLatency: null
  })
})
