import { ok, route } from '@/lib/api/response'
import { subscriptionUpdateSchema } from '@/lib/api/schemas'
import { requireApiSession } from '@/lib/auth/guard'
import { getUserSubscription, updateUserSubscription } from '@/lib/services/billing'

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const session = await requireApiSession()
  const { id } = await ctx.params
  return ok(await getUserSubscription(session.user.id, session.user.email, id))
})

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const session = await requireApiSession()
  const { id } = await ctx.params
  const input = subscriptionUpdateSchema.parse(await req.json())
  return ok(await updateUserSubscription(session.user.id, session.user.email, id, input))
})
