/**
 * Next.js 启动钩子：Node runtime 下启动进程内定时任务。
 * 不使用 cron 依赖（单机 + setInterval + PG advisory lock 足够）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { startJobs } = await import('./lib/jobs')
  startJobs()
}
