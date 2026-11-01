import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getNodeTraffic } from '@/lib/services/stats'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 7
const MAX_DAYS = 90

function parseDays(raw: string | null) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAYS
  return Math.min(Math.floor(value), MAX_DAYS)
}

/** 按节点汇总最近 N 天流量与活跃用户数（裸数组，前端可直接消费） */
export const GET = route(async (req: Request) => {
  await requireApiSession('admin:dashboard:read')
  const days = parseDays(new URL(req.url).searchParams.get('days'))
  return ok(await getNodeTraffic(days))
})
