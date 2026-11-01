import { list, route } from '@/lib/api/response'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'
import { requireApiSession } from '@/lib/auth/guard'
import { listLogs } from '@/lib/services/logs'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:log:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const filters = {
    q: url.searchParams.get('q') ?? '',
    level: url.searchParams.get('level') ?? '',
    range: url.searchParams.get('range') ?? '',
    ...page
  }

  const { data, total } = await listLogs('audit', filters)
  return list(data, pageMeta(total, page))
})
