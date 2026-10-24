import { closeDatabase, useDb } from '../utils/db'

/**
 * 启动时预热数据库连接：尽早暴露连接错误，而不是等到第一个请求。
 *
 * 构建阶段（无数据库）只警告，不报错。
 */
export default defineNitroPlugin((nitroApp) => {
  try {
    useDb()
  } catch (error) {
    console.warn('[db] 数据库未初始化（构建阶段或未配置 DATABASE_URL）：', (error as Error).message)
  }

  nitroApp.hooks.hook('close', async () => {
    await closeDatabase()
  })
})
