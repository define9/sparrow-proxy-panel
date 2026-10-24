import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '../../drizzle/schema'

export type Database = ReturnType<typeof drizzle<typeof schema>>

let _db: Database | undefined
let _pool: pg.Pool | undefined

/**
 * 获取数据库连接（惰性单例）。
 *
 * 面板是无状态多副本部署，连接池随进程生命周期存在；
 * 服务关闭时由 server/plugins/database.ts 调用 closeDatabase() 释放。
 */
export function useDb(): Database {
  if (!_db) {
    const config = useRuntimeConfig()
    // 兼容两种配置来源：
    // - NUXT_DATABASE_URL：Nitro 运行时约定（容器部署用这个）
    // - DATABASE_URL：本地开发 / drizzle-kit 通用（.env 里只写一个也行）
    const connectionString = config.databaseUrl || process.env.DATABASE_URL

    if (!connectionString) {
      throw createError({
        statusCode: 500,
        statusMessage: 'DATABASE_URL_MISSING',
        message: '数据库未配置：请在 src/panel/.env 设置 DATABASE_URL（或 NUXT_DATABASE_URL）'
      })
    }

    _pool = new pg.Pool({
      connectionString,
      max: Number(config.dbPoolMax ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    })

    _db = drizzle(_pool, { schema })
  }

  return _db
}

/** 释放连接池（进程退出时调用） */
export async function closeDatabase(): Promise<void> {
  await _pool?.end()
  _pool = undefined
  _db = undefined
}
