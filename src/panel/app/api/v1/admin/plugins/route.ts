import { list, route } from '@/lib/api/response'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'
import { requireApiSession } from '@/lib/auth/guard'
import { listPlugins } from '@/lib/services/plugins'

/** 插件列表：当前 plugins 表为空时返回空数组（不是 mock 数据） */
export const GET = route(async (req: Request) => {
  await requireApiSession('admin:plugin:read')

  const page = parsePage(new URL(req.url), 50)
  const { data, total } = await listPlugins(page)

  return list(data, pageMeta(total, page))
})
