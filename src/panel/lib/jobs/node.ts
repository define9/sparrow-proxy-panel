import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { JobDefinition, JobResult } from './types'

/** 心跳超时阈值：90s 没上报就判定离线 */
const OFFLINE_AFTER_SECONDS = 90

/**
 * node:health —— 心跳超时的在线节点标记为 offline。
 * 只降不升：节点重新上线由 Agent 心跳接口负责。
 */
export const nodeHealthJob: JobDefinition = {
  name: 'node:health',
  intervalMs: 60_000,
  description: `心跳超过 ${OFFLINE_AFTER_SECONDS}s 未更新的在线节点置为 offline`,
  run: async (): Promise<JobResult> => {
    const { rows } = await db.execute(sql`
      update nodes
      set status = 'offline', updated_at = now()
      where status = 'online'
        and (last_seen_at is null or last_seen_at < now() - interval '90 seconds')
      returning id
    `)

    return { meta: { offline: rows.length, thresholdSeconds: OFFLINE_AFTER_SECONDS } }
  }
}
