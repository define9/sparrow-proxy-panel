import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { taskRuns } from '@/lib/db/schema'
import { withAdvisoryLock } from './lock'
import type { JobDefinition, JobRunSummary, JobTrigger, JobRunStatus } from './types'

/** 同一进程内避免同一任务上一轮未结束时重入（advisory lock 只解决跨进程） */
const inFlight = new Set<string>()

function summarize(
  job: JobDefinition,
  trigger: JobTrigger,
  status: JobRunStatus,
  startedAt: Date,
  options: {
    error?: string | null
    meta?: Record<string, unknown> | null
    reason?: string
  } = {}
): JobRunSummary {
  const finishedAt = new Date()
  return {
    name: job.name,
    status,
    trigger,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    error: options.error ?? null,
    meta: options.meta ?? null,
    ...(options.reason ? { reason: options.reason } : {})
  }
}

/**
 * 执行一次任务：
 * 1. 抢 advisory lock，拿不到就跳过（不写 task_runs，避免刷垃圾行）
 * 2. 抢到后先插一条 running，再执行
 * 3. 成功写 ok + meta，异常写 failed + error；**不向外抛**，避免影响其他任务
 */
export async function executeJob(
  job: JobDefinition,
  trigger: JobTrigger
): Promise<JobRunSummary> {
  const startedAt = new Date()

  if (inFlight.has(job.name)) {
    return summarize(job, trigger, 'skipped', startedAt, { reason: 'already-running' })
  }

  inFlight.add(job.name)

  try {
    const locked = await withAdvisoryLock(job.name, async () => {
      const [run] = await db
        .insert(taskRuns)
        .values({ name: job.name, status: 'running', startedAt })
        .returning({ id: taskRuns.id })

      if (!run) throw new Error('failed to create task_runs row')

      try {
        const result = await job.run()
        const meta = result?.meta ?? null
        const summary = summarize(job, trigger, 'ok', startedAt, { meta })

        await db
          .update(taskRuns)
          .set({
            status: 'ok',
            finishedAt: new Date(summary.finishedAt),
            meta: meta ? JSON.stringify(meta) : null
          })
          .where(eq(taskRuns.id, run.id))

        return summary
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const summary = summarize(job, trigger, 'failed', startedAt, { error: message })
        console.error(`[jobs] ${job.name} failed`, error)

        try {
          await db
            .update(taskRuns)
            .set({
              status: 'failed',
              finishedAt: new Date(summary.finishedAt),
              error: message
            })
            .where(eq(taskRuns.id, run.id))
        } catch (updateError) {
          console.error(`[jobs] ${job.name} failed to record failure`, updateError)
        }

        return summary
      }
    })

    if (!locked.acquired) {
      return summarize(job, trigger, 'skipped', startedAt, { reason: 'advisory-lock-busy' })
    }

    return locked.value
  } catch (error) {
    // 连接池 / 抢锁本身出错
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[jobs] ${job.name} could not start`, error)
    return summarize(job, trigger, 'failed', startedAt, { error: message })
  } finally {
    inFlight.delete(job.name)
  }
}
