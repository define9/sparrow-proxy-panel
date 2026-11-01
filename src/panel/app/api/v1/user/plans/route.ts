import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { listUserPlans } from '@/lib/services/billing'

export const GET = route(async () => {
  await requireApiSession()
  return ok(await listUserPlans())
})
