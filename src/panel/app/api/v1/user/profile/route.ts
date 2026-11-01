import { clientIp, ok, readJson, route } from '@/lib/api/response'
import { profileUpdateSchema } from '@/lib/api/schemas'
import { requireApiSession, requireUserApi } from '@/lib/auth/guard'
import { getProfile, updateProfile } from '@/lib/services/profile'

export const GET = route(async (req) => {
  const session = await requireUserApi(req, 'profile:read')
  return ok(await getProfile(session.user.id))
})

export const PATCH = route(async (req) => {
  const session = await requireApiSession()
  const input = profileUpdateSchema.parse(await readJson(req))

  return ok(await updateProfile(session.user.id, input, clientIp(req)))
})
