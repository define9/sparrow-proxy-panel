import { created, list, route } from '@/lib/api/response'
import { recordAudit } from '@/lib/api/audit'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'
import { requireApiSession } from '@/lib/auth/guard'
import { createSource, listSources, pluginSourceInputSchema } from '@/lib/services/plugins'

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:plugin:read')

  const url = new URL(req.url)
  const page = parsePage(url, 50)
  const { data, total } = await listSources({ q: url.searchParams.get('q') ?? '', ...page })

  return list(data, pageMeta(total, page))
})

export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:plugin:write')
  const body = pluginSourceInputSchema.parse(await req.json())

  const source = await createSource(body)

  await recordAudit(
    req,
    { id: session.user.id, label: session.user.email },
    {
      action: 'plugin_source.create',
      targetType: 'plugin_source',
      targetId: source.id,
      message: `新建索引源「${source.name}」(${source.type})`,
      meta: { url: source.url, enabled: source.enabled }
    }
  )

  return created(source)
})
