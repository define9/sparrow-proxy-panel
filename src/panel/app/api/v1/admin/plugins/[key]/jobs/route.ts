import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { listPluginJobs } from '@/lib/services/plugins'

type Ctx = { params: Promise<{ key: string }> }

export const GET = route<Ctx>(async (_req, ctx) => {
  await requireApiSession('admin:plugin:read')
  const { key } = await ctx.params

  return ok(await listPluginJobs(key))
})
