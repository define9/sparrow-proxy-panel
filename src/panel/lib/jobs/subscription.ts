import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { JobDefinition, JobResult } from './types'

/**
 * subscription:expire —— 到期 / 超量的 active 订阅置 expired。
 * 订单过期关闭不在本任务范围（没有订单超时状态机），保持与文档的最小实现一致。
 */
export const subscriptionExpireJob: JobDefinition = {
  name: 'subscription:expire',
  intervalMs: 10 * 60_000,
  description: '到期与超量订阅置为 expired',
  run: async (): Promise<JobResult> => {
    const expiredByTime = await db.execute(sql`
      update subscriptions
      set status = 'expired', updated_at = now()
      where status = 'active' and expire_at < now()
      returning id
    `)

    const expiredByQuota = await db.execute(sql`
      update subscriptions
      set status = 'expired', updated_at = now()
      where status = 'active' and traffic_limit > 0 and traffic_used >= traffic_limit
      returning id
    `)

    return {
      meta: {
        expiredByTime: expiredByTime.rows.length,
        expiredByQuota: expiredByQuota.rows.length
      }
    }
  }
}
