import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getOverviewStats } from '@/lib/services/stats'

export const dynamic = 'force-dynamic'

export const GET = route(async () => {
  await requireApiSession('admin:dashboard:read')
  return ok(await getOverviewStats())
})
