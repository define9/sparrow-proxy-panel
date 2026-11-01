import { ok, route } from '@/lib/api/response'
import { getSiteConfig } from '@/lib/services/site'

/** 公开站点配置：站点名 / Logo / 公告 / 是否开放注册 */
export const GET = route(async () => ok(await getSiteConfig(), { headers: { 'cache-control': 'public, max-age=60' } }))
