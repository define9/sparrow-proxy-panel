import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getPlan } from '@/lib/services/billing'

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireApiSession()
  const { id } = await ctx.params
  return ok(await getPlan(id))
})
