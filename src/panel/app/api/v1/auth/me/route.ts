import { ok, route } from '@/lib/api/response'
import { getSession } from '@/lib/auth/session'

export const GET = route(async () => {
  const session = await getSession()
  if (!session) return ok({ user: null, permissions: [] })
  return ok({ user: session.user, permissions: session.permissions })
})
