import { noContent, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { nodeUpdateSchema } from '@/lib/api/node-schemas'
import { deleteNode, getNode, updateNode } from '@/lib/services/nodes'

interface RouteContext {
  params: Promise<{ id: string }>
}

export const GET = route<RouteContext>(async (_req, ctx) => {
  await requireApiSession('admin:node:read')
  const { id } = await ctx.params

  return ok(await getNode(id))
})

export const PATCH = route<RouteContext>(async (req, ctx) => {
  const session = await requireApiSession('admin:node:write')
  const { id } = await ctx.params
  const body = nodeUpdateSchema.parse(await req.json())

  return ok(await updateNode(session.user.id, id, body))
})

export const DELETE = route<RouteContext>(async (_req, ctx) => {
  const session = await requireApiSession('admin:node:delete')
  const { id } = await ctx.params

  await deleteNode(session.user.id, id)
  return noContent()
})
