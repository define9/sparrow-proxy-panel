import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta } from '@/lib/api/admin-ops'
import { adminSubscriptionQuerySchema } from '@/lib/api/commerce-schemas'
import { listAdminSubscriptions } from '@/lib/services/admin-commerce'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:subscription:read')

  const url = new URL(req.url)
  const query = adminSubscriptionQuerySchema.parse({
    q: url.searchParams.get('q') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined
  })

  const result = await listAdminSubscriptions(query)

  return ok({
    data: result.data,
    meta: pageMeta(result.total, {
      page: result.page,
      pageSize: result.pageSize,
      offset: (result.page - 1) * result.pageSize
    })
  })
})
