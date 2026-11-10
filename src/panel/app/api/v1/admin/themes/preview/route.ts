import { ok, readJson, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { themeRepoInputSchema } from '@/lib/schemas/theme'
import { previewTheme } from '@/lib/services/themes'

/** 预览：浅克隆后只读 manifest 与接管路径，不落库、不动已安装主题 */
export const POST = route(async (req: Request) => {
  await requireApiSession('admin:settings:write')
  const input = themeRepoInputSchema.parse(await readJson(req))
  return ok(await previewTheme(input))
})
