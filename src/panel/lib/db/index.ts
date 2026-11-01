import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://sparrow:dev@127.0.0.1:5432/sparrow'

/**
 * dev 下 Next 会反复热重载模块，用 globalThis 缓存连接池，避免连接泄漏。
 */
const globalForDb = globalThis as unknown as {
  __sparrowPool?: Pool
}

const pool =
  globalForDb.__sparrowPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__sparrowPool = pool
}

export const db = drizzle(pool, { schema })
export { schema }
export type Db = typeof db
