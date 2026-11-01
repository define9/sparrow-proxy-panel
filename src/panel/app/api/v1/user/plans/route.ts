import { ok, route } from '@/lib/api/response'
import { requireUserApi } from '@/lib/auth/guard'
import { listUserPlans } from '@/lib/services/billing'

export const GET = route(async (req) => {
  await requireUserApi(req, 'profile:read')
  return ok(await listUserPlans())
})
