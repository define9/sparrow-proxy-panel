import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pluginJobRuns, pluginJobs, taskRuns } from '@/lib/db/schema'
import { list, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pageMeta, parseJson, parsePage } from '@/lib/api/admin-ops'

type TaskLog = {
  id: string
  category: 'task'
  level: 'info' | 'warn' | 'error'
  actor: string
  action: string
  target: string
  ip: string | null
  message: string
  createdAt: string
  payload: Record<string, unknown>
}

const JOB_LEVEL: Record<string, 'info' | 'warn' | 'error'> = {
  ok: 'info',
  running: 'info',
  skipped: 'warn',
  failed: 'error',
  timeout: 'error'
}

export const GET = route(async (req: Request) => {
  await requireApiSession('admin:log:read')

  const url = new URL(req.url)
  const page = parsePage(url)
  const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
  const level = url.searchParams.get('level')?.trim() ?? ''
  const hours = Number(url.searchParams.get('range')) || 0
  const since = hours > 0 ? new Date(Date.now() - hours * 3_600_000) : null

  const taskRows = await db.select().from(taskRuns).orderBy(desc(taskRuns.startedAt)).limit(500)
  const jobRows = await db
    .select({
      run: pluginJobRuns,
      pluginKey: pluginJobs.pluginKey,
      jobKey: pluginJobs.jobKey,
      cron: pluginJobs.cron
    })
    .from(pluginJobRuns)
    .innerJoin(pluginJobs, eq(pluginJobs.id, pluginJobRuns.jobId))
    .orderBy(desc(pluginJobRuns.startedAt))
    .limit(500)

  const items: TaskLog[] = [
    ...taskRows.map((row) => ({
      id: row.id,
      category: 'task' as const,
      level: (row.status === 'failed' ? 'error' : row.status === 'running' ? 'info' : 'info') as
        | 'info'
        | 'warn'
        | 'error',
      actor: 'system',
      action: `task.${row.name}`,
      target: row.name,
      ip: null,
      message: row.error ? `${row.name}：${row.error}` : `${row.name} ${row.status}`,
      createdAt: row.startedAt.toISOString(),
      payload: {
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
        error: row.error,
        meta: parseJson<Record<string, unknown>>(row.meta)
      }
    })),
    ...jobRows.map(({ run, pluginKey, jobKey, cron }) => {
      const level = JOB_LEVEL[run.status] ?? 'info'
      const target = `${pluginKey}/${jobKey}`
      return {
        id: run.id,
        category: 'task' as const,
        level,
        actor: 'system',
        action: 'job.run',
        target,
        ip: null,
        message: run.error
          ? `${target} 执行失败：${run.error}`
          : `${target} ${run.status}${run.durationMs ? `（${run.durationMs}ms）` : ''}`,
        createdAt: run.startedAt.toISOString(),
        payload: {
          runId: run.runId,
          status: run.status,
          cron,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
          durationMs: run.durationMs,
          error: run.error,
          result: parseJson<unknown>(run.result)
        }
      }
    })
  ]

  const filtered = items
    .filter((item) => (since ? new Date(item.createdAt) >= since : true))
    .filter((item) => (level && level !== 'all' ? item.level === level : true))
    .filter((item) =>
      q
        ? [item.actor, item.action, item.target, item.message]
            .join(' ')
            .toLowerCase()
            .includes(q)
        : true
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

  const data = filtered.slice(page.offset, page.offset + page.pageSize)

  return list(data, pageMeta(filtered.length, page))
})
