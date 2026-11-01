import { ApiError, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { listJobs, runJobNow } from '@/lib/jobs'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ name: string }> }

/**
 * POST /api/v1/admin/jobs/[name]/run
 * 立即执行一次指定任务，返回执行摘要（status / durationMs / meta）。
 * 任务名含冒号（traffic:flush），按原样解码匹配。
 */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  await requireApiSession('admin:settings:write')
  const { name } = await ctx.params
  const jobName = decodeURIComponent(name)

  if (!listJobs().some((job) => job.name === jobName)) {
    throw new ApiError(404, 'JOB_NOT_FOUND', `任务不存在：${jobName}`)
  }

  const summary = await runJobNow(jobName)
  if (!summary) throw new ApiError(404, 'JOB_NOT_FOUND', `任务不存在：${jobName}`)

  return ok(summary)
})
