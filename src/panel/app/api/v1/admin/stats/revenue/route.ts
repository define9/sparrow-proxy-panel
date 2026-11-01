import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getRevenueSeries } from '@/lib/services/stats'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 14
const MAX_DAYS = 90

function parseDays(raw: string | null) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAYS
  return Math.min(Math.floor(value), MAX_DAYS)
}

/** 仪表盘「收入趋势」：近 N 天按天实收金额 */
export const GET = route(async (req: Request) => {
  await requireApiSession('admin:dashboard:read')
  const days = parseDays(new URL(req.url).searchParams.get('days'))
  return ok(await getRevenueSeries(days))
})
