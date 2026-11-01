/** 定时任务公共类型：注册表条目、单次执行摘要 */

export type JobName = 'traffic:flush' | 'subscription:expire' | 'node:health'

export interface JobResult {
  /** 写入 task_runs.meta 的执行摘要（JSON 可序列化） */
  meta?: Record<string, unknown>
}

export interface JobDefinition {
  name: JobName
  /** 调度间隔（毫秒） */
  intervalMs: number
  description: string
  run: () => Promise<JobResult | void>
}

export type JobRunStatus = 'ok' | 'failed' | 'skipped'

export type JobTrigger = 'schedule' | 'manual'

export interface JobRunSummary {
  name: JobName
  status: JobRunStatus
  trigger: JobTrigger
  startedAt: string
  finishedAt: string
  durationMs: number
  error?: string | null
  meta?: Record<string, unknown> | null
  /** status = skipped 时的原因（锁被占用 / 上一轮未结束） */
  reason?: string
}
