import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getOverview } from '@/lib/services/billing'

export const GET = route(async () => {
  const session = await requireApiSession()
  return ok(
    await getOverview(
      session.user.id,
      session.user.email,
      session.user.username,
      session.user.balance
    )
  )
})
