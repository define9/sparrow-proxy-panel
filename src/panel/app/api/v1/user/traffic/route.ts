import { ok, route } from '@/lib/api/response'
import { trafficRangeSchema } from '@/lib/api/schemas'
import { requireApiSession } from '@/lib/auth/guard'
import { listTraffic } from '@/lib/services/billing'

/** 按天聚合；流量表为空时返回 []，前端自行兜底 */
export const GET = route(async (req) => {
  const session = await requireApiSession()
  const { range } = trafficRangeSchema.parse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  )
  return ok(await listTraffic(session.user.id, range))
})
