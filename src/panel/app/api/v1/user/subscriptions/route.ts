import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { listUserSubscriptions } from '@/lib/services/billing'

export const GET = route(async () => {
  const session = await requireApiSession()
  const data = await listUserSubscriptions(session.user.id, session.user.email)
  return list(data, { total: data.length, page: 1, pageSize: data.length, hasMore: false })
})
