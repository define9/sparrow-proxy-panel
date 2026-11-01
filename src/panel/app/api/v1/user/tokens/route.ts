import { clientIp, created, ok, readJson, route } from '@/lib/api/response'
import { apiTokenCreateSchema } from '@/lib/api/schemas'
import { requireApiSession } from '@/lib/auth/guard'
import { createToken, listTokens } from '@/lib/services/profile'

export const GET = route(async () => {
  const session = await requireApiSession()
  return ok(await listTokens(session.user.id))
})

export const POST = route(async (req) => {
  const session = await requireApiSession()
  const input = apiTokenCreateSchema.parse(await readJson(req))

  return created(await createToken(session.user.id, input, clientIp(req)))
})
