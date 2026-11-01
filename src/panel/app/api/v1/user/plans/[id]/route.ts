import { ok, route } from '@/lib/api/response'
import { requireUserApi } from '@/lib/auth/guard'
import { getPlan } from '@/lib/services/billing'

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireUserApi(req, 'profile:read')
  const { id } = await ctx.params
  return ok(await getPlan(id))
})
