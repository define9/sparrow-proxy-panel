import 'server-only'
import { desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError } from '@/lib/api/response'
import { pluginConfigFields, pluginDto, pluginEventDto, pluginJobDto, pluginRunDto } from '@/lib/api/admin-plugins'
import { db } from '@/lib/db'
import { pluginEvents, pluginJobRuns, pluginJobs, pluginSources, plugins } from '@/lib/db/schema'

/**
 * 插件服务层：已安装插件、插件作业与索引源的查询/创建。
 * 安装流水线尚未实现（见 docs/architecture/plugin-system.md §6），本层不提供安装能力。
 */

export type PluginSummaryDto = ReturnType<typeof pluginDto> & { jobCount: number }

export interface PluginDetailDto extends ReturnType<typeof pluginDto> {
  config: ReturnType<typeof pluginConfigFields>
  jobs: ReturnType<typeof pluginJobDto>[]
  events: ReturnType<typeof pluginEventDto>[]
}

export type PluginJobWithRunsDto = ReturnType<typeof pluginJobDto> & {
  runs: ReturnType<typeof pluginRunDto>[]
}

export interface PluginListFilters {
  page: number
  pageSize: number
  offset: number
}

export interface PluginListResult {
  data: PluginSummaryDto[]
  total: number
}

/** 插件列表：当前 plugins 表为空时返回空数组（不是 mock 数据） */
export async function listPlugins(filters: PluginListFilters): Promise<PluginListResult> {
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
    .limit(filters.pageSize)
    .offset(filters.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(plugins)

  return {
    data: rows.map(({ plugin, jobCount }) => ({ ...pluginDto(plugin), jobCount: Number(jobCount ?? 0) })),
    total: Number(countRow?.total ?? 0)
  }
}

export async function getPlugin(key: string): Promise<PluginDetailDto> {
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

  return {
    ...pluginDto(row),
    config: pluginConfigFields(row.config),
    jobs: jobs.map(pluginJobDto),
    events: events.map(pluginEventDto)
  }
}

/** 插件作业及其最近 100 次运行记录 */
export async function listPluginJobs(key: string): Promise<PluginJobWithRunsDto[]> {
  const jobs = await db.select().from(pluginJobs).where(eq(pluginJobs.pluginKey, key))
  const jobIds = jobs.map((job) => job.id)

  const runs =
    jobIds.length > 0
      ? await db
          .select()
          .from(pluginJobRuns)
          .where(inArray(pluginJobRuns.jobId, jobIds))
          .orderBy(desc(pluginJobRuns.startedAt))
          .limit(100)
      : []

  const runsByJob = new Map<string, ReturnType<typeof pluginRunDto>[]>()
  for (const run of runs) {
    const list = runsByJob.get(run.jobId) ?? []
    list.push(pluginRunDto(run))
    runsByJob.set(run.jobId, list)
  }

  return jobs.map((job) => ({ ...pluginJobDto(job), runs: runsByJob.get(job.id) ?? [] }))
}

/* -------------------------------- 索引源 -------------------------------- */

export const pluginSourceInputSchema = z.object({
  name: z.string().trim().min(1, '请填写索引源名称').max(64),
  type: z.enum(['url', 'git', 'marketplace']).default('url'),
  url: z
    .string()
    .trim()
    .url('请填写合法地址')
    .refine((value) => value.startsWith('https://'), '只允许 https 地址'),
  enabled: z.boolean().default(true)
})

export type PluginSourceInput = z.infer<typeof pluginSourceInputSchema>

export interface PluginSourceDto {
  id: string
  name: string
  type: string
  url: string
  enabled: boolean
  lastSyncedAt: string | null
  status: 'healthy' | 'error' | 'unknown'
  lastError: string | null
  createdAt: string
}

type PluginSourceRow = typeof pluginSources.$inferSelect

function toPluginSourceDto(row: PluginSourceRow): PluginSourceDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    enabled: row.enabled,
    lastSyncedAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    status: row.lastStatus === 'healthy' || row.lastStatus === 'error' ? row.lastStatus : 'unknown',
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString()
  }
}

export interface PluginSourceListFilters {
  q?: string
  page: number
  pageSize: number
  offset: number
}

export interface PluginSourceListResult {
  data: PluginSourceDto[]
  total: number
}

export async function listSources(filters: PluginSourceListFilters): Promise<PluginSourceListResult> {
  const keyword = filters.q?.trim() ?? ''
  const where = keyword ? ilike(pluginSources.name, `%${keyword}%`) : undefined

  const rows = await db
    .select()
    .from(pluginSources)
    .where(where)
    .orderBy(desc(pluginSources.createdAt))
    .limit(filters.pageSize)
    .offset(filters.offset)

  const [countRow] = await db.select({ total: sql<string>`count(*)` }).from(pluginSources).where(where)

  return { data: rows.map(toPluginSourceDto), total: Number(countRow?.total ?? 0) }
}

export async function createSource(input: PluginSourceInput): Promise<PluginSourceDto> {
  const [row] = await db
    .insert(pluginSources)
    .values({ name: input.name, type: input.type, url: input.url, enabled: input.enabled })
    .returning()

  return toPluginSourceDto(row)
}
