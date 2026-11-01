import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agentCommands, nodes } from '@/lib/db/schema'
import { ApiError, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireApiSession('admin:node:write')
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) throw new ApiError(404, 'NODE_NOT_FOUND', '节点不存在')

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

  return ok({
    configVersion: node.configVersion,
    commandId: command!.id,
    commandStatus: command!.status,
    syncedAt: new Date().toISOString()
  })
})
