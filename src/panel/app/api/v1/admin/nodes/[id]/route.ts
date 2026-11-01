import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentCommands, agentEvents, nodeGroups, nodeHeartbeats, nodes } from '@/lib/db/schema'
import { ApiError, noContent, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { nodeUpdateSchema } from '@/lib/api/node-schemas'
import { toAdminNode } from '@/lib/api/node-record'
import { createRegistrationToken } from '@/lib/agent/secret'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseId(id: string) {
  if (!UUID_RE.test(id)) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')
  return id
}

export const GET = route(async (_req: Request, ctx: RouteContext) => {
  await requireApiSession('admin:node:read')
  const id = parseId((await ctx.params).id)

  const [row] = await db
    .select({ node: nodes, heartbeat: nodeHeartbeats, groupName: nodeGroups.name, groupRegion: nodeGroups.region })
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

  return ok({
    ...toAdminNode(row.node, { name: row.groupName, region: row.groupRegion }, row.heartbeat),
    registrationToken: row.node.agentSecretHash ? null : createRegistrationToken(id),
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      level: event.level,
      message: event.message,
      payload: event.payload,
      createdAt: event.createdAt.toISOString()
    })),
    commands: commands.map((command) => ({
      id: command.id,
      command: command.command,
      payload: command.payload,
      status: command.status,
      issuedAt: command.issuedAt.toISOString(),
      finishedAt: command.finishedAt?.toISOString() ?? null,
      result: command.result
    }))
  })
})

export const PATCH = route(async (req: Request, ctx: RouteContext) => {
  await requireApiSession('admin:node:write')
  const id = parseId((await ctx.params).id)
  const body = nodeUpdateSchema.parse(await req.json())

  const [existing] = await db.select({ id: nodes.id }).from(nodes).where(eq(nodes.id, id)).limit(1)
  if (!existing) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')

  if (body.groupId) {
    const [group] = await db
      .select({ id: nodeGroups.id })
      .from(nodeGroups)
      .where(eq(nodeGroups.id, body.groupId))
      .limit(1)
    if (!group) throw new ApiError(422, 'NODE_GROUP_NOT_FOUND', '节点组不存在', { field: 'groupId' })
  }

  const [node] = await db
    .update(nodes)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.groupId !== undefined && { groupId: body.groupId }),
      ...(body.protocol !== undefined && { protocol: body.protocol }),
      ...(body.host !== undefined && { host: body.host }),
      ...(body.port !== undefined && { port: body.port }),
      ...(body.network !== undefined && { network: body.network }),
      ...(body.tlsMode !== undefined && { tlsMode: body.tlsMode }),
      ...(body.sni !== undefined && { sni: body.sni }),
      ...(body.path !== undefined && { path: body.path }),
      ...(body.trafficRate !== undefined && { trafficRate: body.trafficRate.toFixed(2) }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.weight !== undefined && { weight: body.weight }),
      ...(body.sort !== undefined && { sort: body.sort }),
      ...(body.remark !== undefined && { remark: body.remark }),
      updatedAt: new Date()
    })
    .where(eq(nodes.id, id))
    .returning()

  const [row] = await db
    .select({ groupName: nodeGroups.name, groupRegion: nodeGroups.region })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, node!.groupId))
    .limit(1)

  return ok(toAdminNode(node!, row ? { name: row.groupName, region: row.groupRegion } : { name: '', region: '' }, null))
})

export const DELETE = route(async (_req: Request, ctx: RouteContext) => {
  await requireApiSession('admin:node:delete')
  const id = parseId((await ctx.params).id)

  const [deleted] = await db.delete(nodes).where(eq(nodes.id, id)).returning({ id: nodes.id })
  if (!deleted) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')

  return noContent()
})
