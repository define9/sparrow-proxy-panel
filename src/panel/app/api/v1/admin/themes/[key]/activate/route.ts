import { clientIp, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { activateTheme } from '@/lib/services/themes'

type Ctx = { params: Promise<{ key: string }> }

/** 激活主题；key = default 表示回落到面板自带落地页。激活后无需重启。 */
export const POST = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:settings:write')
  const { key } = await ctx.params

  const actor = { id: session.user.id, label: session.user.email, type: 'user' as const, ip: clientIp(req) }
  return ok(await activateTheme(actor, key))
})
