import { nodeHealthJob } from './node'
import { subscriptionExpireJob } from './subscription'
import { trafficFlushJob } from './traffic'
import { executeJob } from './runner'
import type { JobDefinition, JobName, JobRunSummary } from './types'

export type { JobDefinition, JobName, JobRunSummary } from './types'

/** 注册表：新增任务只需要在这里加一行 */
const JOBS: JobDefinition[] = [trafficFlushJob, subscriptionExpireJob, nodeHealthJob]

const globalForJobs = globalThis as unknown as {
  __sparrowJobTimers?: NodeJS.Timeout[]
}

export interface JobCatalogItem {
  name: JobName
  intervalMs: number
  description: string
}

export function listJobs(): JobCatalogItem[] {
  return JOBS.map(({ name, intervalMs, description }) => ({ name, intervalMs, description }))
}

export function getJob(name: string): JobDefinition | undefined {
  return JOBS.find((job) => job.name === name)
}

/** 手动触发一次；任务不存在返回 null */
export async function runJobNow(name: string): Promise<JobRunSummary | null> {
  const job = getJob(name)
  if (!job) return null
  return executeJob(job, 'manual')
}

function jobsDisabled() {
  return process.env.DISABLE_JOBS === '1'
}

/**
 * 启动调度：仅在 Node runtime 生效；setInterval 常驻进程（单机单副本，
 * 多副本靠 advisory lock 去重）。重复调用是幂等的（dev 热重载 / instrumentation 重入）。
 */
export function startJobs() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (jobsDisabled()) {
    console.info('[jobs] DISABLE_JOBS=1, scheduler disabled')
    return
  }
  if (globalForJobs.__sparrowJobTimers?.length) return

  const timers: NodeJS.Timeout[] = []

  for (const job of JOBS) {
    console.info(`[jobs] scheduled ${job.name} every ${job.intervalMs}ms`)

    // 启动即跑一轮，避免刚部署时流量要等一个完整周期
    void executeJob(job, 'schedule').catch((error) => {
      console.error(`[jobs] ${job.name} bootstrap run failed`, error)
    })

    const timer = setInterval(() => {
      void executeJob(job, 'schedule').catch((error) => {
        console.error(`[jobs] ${job.name} scheduled run failed`, error)
      })
    }, job.intervalMs)

    // 不让定时器阻止进程退出（next start 有 HTTP server 撑着）
    timer.unref?.()
    timers.push(timer)
  }

  globalForJobs.__sparrowJobTimers = timers
}

export function stopJobs() {
  const timers = globalForJobs.__sparrowJobTimers
  if (!timers?.length) return
  for (const timer of timers) clearInterval(timer)
  globalForJobs.__sparrowJobTimers = undefined
  console.info('[jobs] scheduler stopped')
}
