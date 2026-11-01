import { desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pluginJobs, plugins } from '@/lib/db/schema'
import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta, parsePage } from '@/lib/api/admin-ops'
import { pluginDto } from '@/lib/api/admin-plugins'

/** 插件列表：当前 plugins 表为空时返回空数组（不是 mock 数据） */
export const GET = route(async (req: Request) => {
  await requireApiSession('admin:plugin:read')

  const page = parsePage(new URL(req.url), 50)

  const rows = await db
    .select({
      plugin: plugins,
      jobCount: sql<number>`(
        select count(*)::int from ${pluginJobs}
        where ${pluginJobs.pluginKey} = ${plugins.key}
      )`
    })
    .from(plugins)
    .orderBy(desc(plugins.installedAt))
    .limit(page.pageSize)
    .offset(page.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(plugins)

  return list(
    rows.map(({ plugin, jobCount }) => ({ ...pluginDto(plugin), jobCount: Number(jobCount ?? 0) })),
    pageMeta(Number(countRow?.total ?? 0), page)
  )
})
