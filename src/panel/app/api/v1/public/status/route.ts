import { ok, route } from '@/lib/api/response'
import { getPanelStatus } from '@/lib/services/site'

/** 匿名探活：面板存活 + 节点在线数 */
export const GET = route(async () =>
  ok(await getPanelStatus(), { headers: { 'cache-control': 'no-store' } })
)
