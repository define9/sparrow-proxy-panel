import { ok, route } from '@/lib/api/response'
import { requireUserApi } from '@/lib/auth/guard'
import { getOverview } from '@/lib/services/billing'

export const GET = route(async (req) => {
  const session = await requireUserApi(req, 'profile:read')
  return ok(
    await getOverview(
      session.user.id,
      session.user.email,
      session.user.username,
      session.user.balance
    )
  )
})
