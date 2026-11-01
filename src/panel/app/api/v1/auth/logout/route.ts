import { ok, route } from '@/lib/api/response'
import { destroySession } from '@/lib/auth/session'

export const POST = route(async () => {
  await destroySession()
  return ok({ ok: true })
})
