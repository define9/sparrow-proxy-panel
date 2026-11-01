import { created, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { nodeGroupInputSchema, nodeGroupUpdateSchema } from '@/lib/api/node-schemas'
import { createNodeGroup, listNodeGroups, updateNodeGroup } from '@/lib/services/nodes'

/** 节点组列表：附带每组的节点数 / 在线数（avgLatency 暂无探测数据，为 null） */
export const GET = route(async () => {
  await requireApiSession('admin:node:read')

  return ok({ data: await listNodeGroups() })
})

export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:node:write')
  const body = nodeGroupInputSchema.parse(await req.json())

  return created(await createNodeGroup(session.user.id, body))
})

export const PATCH = route(async (req: Request) => {
  const session = await requireApiSession('admin:node:write')
  const body = nodeGroupUpdateSchema.parse(await req.json())

  return ok(await updateNodeGroup(session.user.id, body.id, body))
})
