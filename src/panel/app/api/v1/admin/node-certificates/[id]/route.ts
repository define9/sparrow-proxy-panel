import { noContent, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { deleteCertificate } from '@/lib/services/nodes'

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireApiSession('admin:node:write')
  const { id } = await ctx.params

  await deleteCertificate(session.user.id, id)
  return noContent()
})
