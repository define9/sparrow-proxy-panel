import { clientIp, ok, readJson, route } from '@/lib/api/response'
import { changePasswordSchema } from '@/lib/api/schemas'
import { requireApiSession } from '@/lib/auth/guard'
import { changePassword } from '@/lib/services/profile'

export const POST = route(async (req) => {
  const session = await requireApiSession()
  const input = changePasswordSchema.parse(await readJson(req))

  return ok(await changePassword(session.user.id, session.sessionId, input, clientIp(req)))
})
