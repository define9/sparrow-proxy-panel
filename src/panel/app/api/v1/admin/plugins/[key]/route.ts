import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pluginEvents, pluginJobs, plugins } from '@/lib/db/schema'
import { ApiError, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pluginConfigFields, pluginDto, pluginEventDto, pluginJobDto } from '@/lib/api/admin-plugins'

type Ctx = { params: Promise<{ key: string }> }

export const GET = route<Ctx>(async (_req, ctx) => {
  await requireApiSession('admin:plugin:read')
  const { key } = await ctx.params

  const [row] = await db.select().from(plugins).where(eq(plugins.key, key)).limit(1)
  if (!row) throw new ApiError(404, 'PLUGIN_NOT_FOUND', '插件未安装')

  const [jobs, events] = await Promise.all([
    db.select().from(pluginJobs).where(eq(pluginJobs.pluginKey, key)),
    db
      .select()
      .from(pluginEvents)
      .where(eq(pluginEvents.pluginId, row.id))
      .orderBy(desc(pluginEvents.createdAt))
      .limit(50)
  ])

  return ok({
    ...pluginDto(row),
    config: pluginConfigFields(row.config),
    jobs: jobs.map(pluginJobDto),
    events: events.map(pluginEventDto)
  })
})
