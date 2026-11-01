import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'
import { listUsers } from '@/lib/services/admin-users'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:user:read')

  const url = new URL(req.url)
  const page = parsePage(url)

  const { items, total } = await listUsers({
    q: url.searchParams.get('q') ?? '',
    role: url.searchParams.get('role') ?? '',
    status: url.searchParams.get('status') ?? '',
    page: page.page,
    pageSize: page.pageSize
  })

  return list(items, pageMeta(total, page))
})
