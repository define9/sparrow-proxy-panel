import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeCertificates } from '@/lib/db/schema'
import { ApiError, noContent, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireApiSession('admin:node:write')
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) throw new ApiError(404, 'NODE_CERT_NOT_FOUND', '证书不存在')

  const [deleted] = await db
    .delete(nodeCertificates)
    .where(eq(nodeCertificates.id, id))
    .returning({ id: nodeCertificates.id })
  if (!deleted) throw new ApiError(404, 'NODE_CERT_NOT_FOUND', '证书不存在')

  return noContent()
})
