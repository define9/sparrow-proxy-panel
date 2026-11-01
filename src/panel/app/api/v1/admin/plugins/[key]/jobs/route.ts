import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { pluginJobRuns, pluginJobs } from '@/lib/db/schema'
import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { pluginJobDto, pluginRunDto } from '@/lib/api/admin-plugins'

type Ctx = { params: Promise<{ key: string }> }

export const GET = route<Ctx>(async (_req, ctx) => {
  await requireApiSession('admin:plugin:read')
  const { key } = await ctx.params

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

  return ok(
    jobs.map((job) => ({
      ...pluginJobDto(job),
      runs: runsByJob.get(job.id) ?? []
    }))
  )
})
