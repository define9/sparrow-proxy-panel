import { created, list, route } from '@/lib/api/response'
import { orderInputSchema, orderListQuerySchema } from '@/lib/api/schemas'
import { requireApiSession, requireUserApi } from '@/lib/auth/guard'
import { createOrder, listUserOrders } from '@/lib/services/billing'

export const GET = route(async (req) => {
  const session = await requireUserApi(req, 'orders:read')
  const query = orderListQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  )

  const result = await listUserOrders(session.user.id, session.user.email, query)
  const hasMore = result.page * result.pageSize < result.total

  return list(result.data, {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    hasMore
  })
})

export const POST = route(async (req) => {
  const session = await requireApiSession()
  const input = orderInputSchema.parse(await req.json())

  const order = await createOrder(session.user.id, session.user.email, input)
  return created(order)
})
