import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { listGateways } from '@/lib/payments'

/** 支付渠道列表：声明（fields / methods）+ 当前脱敏配置 */
export const GET = route(async () => {
  await requireApiSession('admin:settings:read')
  return ok(await listGateways())
})
