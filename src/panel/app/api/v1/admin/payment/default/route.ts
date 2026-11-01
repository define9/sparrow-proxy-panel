import { clientIp, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { paymentDefaultSchema } from '@/lib/api/schemas'
import { setDefaultGateway } from '@/lib/payments'

/** 设置默认支付渠道 */
export const PUT = route(async (req: Request) => {
  const session = await requireApiSession('admin:settings:write')
  const { key } = paymentDefaultSchema.parse(await req.json())

  const actor = { id: session.user.id, label: session.user.email, ip: clientIp(req) }
  return ok(await setDefaultGateway(actor, key))
})
