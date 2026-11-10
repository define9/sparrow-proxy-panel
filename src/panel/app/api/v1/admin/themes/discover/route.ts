import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { themeDiscoverQuerySchema } from '@/lib/schemas/theme'
import { discoverThemes } from '@/lib/services/themes'

/**
 * 主题发现：source=github 按 topic `sparrow-proxy-theme` 搜索；
 * source=releases 目前为未实现的占位（明确标注，不伪造数据）。
 */
export const GET = route(async (req: Request) => {
  await requireApiSession('admin:settings:read')

  const url = new URL(req.url)
  const query = themeDiscoverQuerySchema.parse({
    q: url.searchParams.get('q') ?? undefined,
    source: url.searchParams.get('source') ?? undefined
  })

  return ok(await discoverThemes(query.source, query.q))
})
