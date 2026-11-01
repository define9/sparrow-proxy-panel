import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getAdminOrder } from '@/lib/services/admin-commerce'

type Ctx = { params: Promise<{ id: string }> }

export const GET = route<Ctx>(async (_req, ctx) => {
  await requireApiSession('admin:order:read')
  const { id } = await ctx.params
  return ok(await getAdminOrder(id))
})
