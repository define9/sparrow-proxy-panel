import type { Pool } from 'pg'
import { db } from '@/lib/db'

export type LockResult<T> = { acquired: true; value: T } | { acquired: false }

/**
 * PostgreSQL 会话级 advisory lock。
 *
 * 注意：pg_try_advisory_lock / pg_advisory_unlock 必须落在**同一个连接**上，
 * 而 drizzle 的 db.execute 每次从连接池取连接，不保证同一条。所以这里从池里
 * 单独借一个 client，持锁 → 执行任务 → 解锁 → 归还。
 *
 * 单副本时等价于每轮必得锁；多副本时天然去重（拿不到锁的副本直接跳过）。
 */
export async function withAdvisoryLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<LockResult<T>> {
  const pool = db.$client as unknown as Pool
  const client = await pool.connect()

  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtext($1)) as locked',
      [key]
    )
    if (!rows[0]?.locked) return { acquired: false }

    try {
      return { acquired: true, value: await fn() }
    } finally {
      try {
        await client.query('select pg_advisory_unlock(hashtext($1))', [key])
      } catch (error) {
        // 解锁失败不覆盖任务本身的错误；连接归还时 PG 也会自动释放在本会话持有的锁
        console.error(`[jobs] unlock ${key} failed`, error)
      }
    }
  } finally {
    client.release()
  }
}
