import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getTrafficSeries } from '@/lib/services/stats'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 14
const MAX_DAYS = 90

function parseDays(raw: string | null) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAYS
  return Math.min(Math.floor(value), MAX_DAYS)
}

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:dashboard:read')
  const days = parseDays(new URL(req.url).searchParams.get('days'))
  return ok(await getTrafficSeries(days))
})
