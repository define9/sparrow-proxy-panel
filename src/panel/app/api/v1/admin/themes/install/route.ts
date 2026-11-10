import { clientIp, ok, readJson, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { themeRepoInputSchema } from '@/lib/schemas/theme'
import { installTheme } from '@/lib/services/themes'

/** 安装 / 升级主题（同步执行，clone 60s 超时；失败不影响已安装版本） */
export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:settings:write')
  const input = themeRepoInputSchema.parse(await readJson(req))

  const actor = { id: session.user.id, label: session.user.email, type: 'user' as const, ip: clientIp(req) }
  return ok(await installTheme(actor, input))
})
