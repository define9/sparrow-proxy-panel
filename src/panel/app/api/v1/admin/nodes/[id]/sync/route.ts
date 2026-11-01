import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { syncNode } from '@/lib/services/nodes'

export const POST = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApiSession('admin:node:write')
  const { id } = await ctx.params

  return ok(await syncNode(session.user.id, id))
})
