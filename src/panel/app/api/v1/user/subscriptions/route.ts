import { list, route } from '@/lib/api/response'
import { requireUserApi } from '@/lib/auth/guard'
import { listUserSubscriptions } from '@/lib/services/billing'

export const GET = route(async (req) => {
  const session = await requireUserApi(req, 'subscription:read')
  const data = await listUserSubscriptions(session.user.id, session.user.email)
  return list(data, { total: data.length, page: 1, pageSize: data.length, hasMore: false })
})
