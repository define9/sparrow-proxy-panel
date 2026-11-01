/**
 * Next.js 启动钩子：Node runtime 下启动进程内定时任务 + 内置插件入库。
 * 不使用 cron 依赖（单机 + setInterval + PG advisory lock 足够）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // 内置插件（当前是支付渠道）幂等 upsert 进 plugins 表；
  // 失败不阻塞启动，listGateways() 首次调用还会再兜一次。
  try {
    const { ensureBuiltinPlugins } = await import('./lib/plugin-host/registry')
    await ensureBuiltinPlugins()
  } catch (error) {
    console.error('[plugin-host] 内置插件初始化失败', error)
  }

  const { startJobs } = await import('./lib/jobs')
  startJobs()
}
