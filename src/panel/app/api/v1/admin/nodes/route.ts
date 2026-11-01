import { created, list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { nodeInputSchema } from '@/lib/api/schemas'
import { nodeQuerySchema } from '@/lib/api/node-schemas'
import { createNode, listNodes } from '@/lib/services/nodes'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:node:read')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const { data, meta } = await listNodes(nodeQuerySchema.parse(params))

  return list(data, meta)
})

export const POST = route(async (req: Request) => {
  await requireApiSession('admin:node:write')

  const body = nodeInputSchema.parse(await req.json())

  return created(await createNode(body))
})
