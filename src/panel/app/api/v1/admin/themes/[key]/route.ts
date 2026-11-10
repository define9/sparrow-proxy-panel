import { clientIp, noContent, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { deleteTheme } from '@/lib/services/themes'

type Ctx = { params: Promise<{ key: string }> }

/** 卸载主题：若正被激活先回落到 default，再删库与磁盘文件（含 {key}.bak） */
export const DELETE = route<Ctx>(async (req, ctx) => {
  const session = await requireApiSession('admin:settings:write')
  const { key } = await ctx.params

  const actor = { id: session.user.id, label: session.user.email, type: 'user' as const, ip: clientIp(req) }
  await deleteTheme(actor, key)

  return noContent()
})
