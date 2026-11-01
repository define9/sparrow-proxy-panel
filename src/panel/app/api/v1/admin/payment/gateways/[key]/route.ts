import { clientIp, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { paymentGatewayUpdateSchema } from '@/lib/api/schemas'
import { saveGateway } from '@/lib/payments'

type Ctx = { params: Promise<{ key: string }> }

/** 保存单个渠道：{ enabled?, config? }，secret 字段回传 MASK 表示保留原值 */
export const PUT = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:settings:write')
  const { key } = await ctx.params
  const body = paymentGatewayUpdateSchema.parse(await req.json())

  const actor = { id: session.user.id, label: session.user.email, ip: clientIp(req) }
  return ok(await saveGateway(actor, key, body))
})
