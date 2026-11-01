import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta } from '@/lib/api/admin-ops'
import { adminOrderQuerySchema } from '@/lib/api/commerce-schemas'
import { listAdminOrders } from '@/lib/services/admin-commerce'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:order:read')

  const url = new URL(req.url)
  const query = adminOrderQuerySchema.parse({
    status: url.searchParams.get('status') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined
  })

  const result = await listAdminOrders(query)

  // counts 是商品/订单页 Tab 角标的附加字段，不改变 data/meta 契约
  return ok({
    data: result.data,
    meta: pageMeta(result.total, {
      page: result.page,
      pageSize: result.pageSize,
      offset: (result.page - 1) * result.pageSize
    }),
    counts: result.counts
  })
})
