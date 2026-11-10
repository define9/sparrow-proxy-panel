import { route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { getThemePreview } from '@/lib/services/themes'

type Ctx = { params: Promise<{ key: string }> }

/** 主题截图：读 ${THEME_DIR}/{key}/dist/<preview>，没有则 404 */
export const GET = route<Ctx>(async (_req, ctx) => {
  await requireApiSession('admin:settings:read')
  const { key } = await ctx.params

  const image = await getThemePreview(key)

  return new Response(new Uint8Array(image.data), {
    headers: {
      'content-type': image.contentType,
      'content-length': String(image.data.byteLength),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  })
})
