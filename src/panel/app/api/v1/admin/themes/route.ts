import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getThemes } from '@/lib/services/themes'

/** 主题列表：当前激活态 + 已安装主题 + 面板自带落地页标识 */
export const GET = route(async () => {
  await requireApiSession('admin:settings:read')
  return ok(await getThemes())
})
