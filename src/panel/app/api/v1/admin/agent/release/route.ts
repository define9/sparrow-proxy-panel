import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getAgentReleaseAdmin } from '@/lib/services/agent-release'

/** 管理端查看当前 Agent 发布源（版本 / 平台 / 更新时间），供节点管理页展示 */
export const GET = route(async () => {
  await requireApiSession('admin:settings:read')
  return ok(await getAgentReleaseAdmin(), { headers: { 'cache-control': 'no-store' } })
})
