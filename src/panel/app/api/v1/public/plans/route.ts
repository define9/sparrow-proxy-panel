import { ok, route } from '@/lib/api/response'
import { listPublicPlans } from '@/lib/services/billing'

/** 匿名可访问：只返回在售商品，按 sort 升序 */
export const GET = route(async () => {
  const data = await listPublicPlans()
  return ok(data, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
  })
})
