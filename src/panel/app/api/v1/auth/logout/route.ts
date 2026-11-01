import { ok, route } from '@/lib/api/response'
import { getSession } from '@/lib/auth/session'
import { logout } from '@/lib/services/auth'

export const POST = route(async () => {
  const session = await getSession()
  await logout(session?.sessionId)
  return ok({ ok: true })
})
