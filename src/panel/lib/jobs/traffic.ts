import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { JobDefinition, JobResult } from './types'

/** 首次执行（或历史游标丢失）时回扫最近 5 分钟 */
const INITIAL_LOOKBACK_MS = 5 * 60_000

interface LogRow {
  user_id: string
  node_id: string
  date: string
  upload: string
  download: string
}

interface DailyAgg {
  userId: string
  date: string
  upload: bigint
  download: bigint
}

interface NodeAgg extends DailyAgg {
  nodeId: string
}

/**
 * 时间游标：上一次成功执行写进 task_runs.meta.cursor（本次窗口上界）。
 *
 * 为什么不改 schema 加 processed 标记：约束里不允许改表。
 * 为什么不用「扫最近 5 分钟」：30s 一轮会把同一批明细重复计入 10 次。
 * 代价：明细行在窗口内提交晚了（事务提交顺序晚于 created_at）会被漏掉，
 * 概率极低（Agent 上报是单条 insert），且流量可容忍 < 1s 的误差。
 */
async function readCursor(): Promise<Date | null> {
  const { rows } = await db.execute(sql`
    select meta
    from task_runs
    where name = 'traffic:flush' and status = 'ok' and meta is not null
    order by started_at desc
    limit 1
  `)

  const meta = (rows[0] as { meta?: string } | undefined)?.meta
  if (!meta) return null

  try {
    const parsed = JSON.parse(meta) as { cursor?: string }
    if (!parsed.cursor) return null
    const cursor = new Date(parsed.cursor)
    return Number.isNaN(cursor.getTime()) ? null : cursor
  } catch {
    return null
  }
}

function accumulate<T extends { upload: bigint; download: bigint }>(
  map: Map<string, T>,
  key: string,
  base: Omit<T, 'upload' | 'download'>,
  upload: bigint,
  download: bigint
) {
  const current = map.get(key)
  if (current) {
    current.upload += upload
    current.download += download
    return
  }
  map.set(key, { ...base, upload, download } as T)
}

/**
 * traffic:flush —— 明细增量 → (user, date) 日汇总 + (node, user, date) 节点汇总
 * 同时把增量累加到用户当前生效订阅的 traffic_used / upload / download。
 *
 * 注意：Agent 上报接口目前也会即时累加 subscriptions（见 lib/agent 实现），
 * 真实链路上两侧同时累加会重复计数；本任务按约定实现，切换时需让 Agent 侧
 * 只写 traffic_logs。手动补数据 / 迁移场景下本任务是唯一累加方。
 */
export const trafficFlushJob: JobDefinition = {
  name: 'traffic:flush',
  intervalMs: 30_000,
  description: 'traffic_logs 增量按用户/节点聚合到 traffic_daily(_node) 并累加订阅已用流量',
  run: async (): Promise<JobResult> => {
    const now = new Date()
    const cursor = (await readCursor()) ?? new Date(now.getTime() - INITIAL_LOOKBACK_MS)

    if (cursor >= now) {
      return { meta: { cursor: now.toISOString(), windowFrom: cursor.toISOString(), rows: 0 } }
    }

    const { rows } = await db.execute(sql`
      select
        user_id::text as user_id,
        node_id::text as node_id,
        created_at::date::text as date,
        coalesce(sum(upload), 0)::text as upload,
        coalesce(sum(download), 0)::text as download
      from traffic_logs
      where created_at > ${cursor} and created_at <= ${now}
      group by user_id, node_id, created_at::date
    `)

    const logRows = rows as unknown as LogRow[]
    const daily = new Map<string, DailyAgg>()
    const nodeDaily = new Map<string, NodeAgg>()
    let uploadTotal = BigInt(0)
    let downloadTotal = BigInt(0)

    for (const row of logRows) {
      const upload = BigInt(row.upload ?? 0)
      const download = BigInt(row.download ?? 0)
      uploadTotal += upload
      downloadTotal += download

      const dailyKey = `${row.user_id}|${row.date}`
      accumulate(daily, dailyKey, { userId: row.user_id, date: row.date }, upload, download)

      const nodeKey = `${row.node_id}|${row.user_id}|${row.date}`
      accumulate(
        nodeDaily,
        nodeKey,
        { nodeId: row.node_id, userId: row.user_id, date: row.date },
        upload,
        download
      )
    }

    let subscriptionsUpdated = 0

    if (daily.size > 0) {
      const dailyRows = [...daily.values()]
      const userIds = dailyRows.map((row) => row.userId)
      const dates = dailyRows.map((row) => row.date)
      const uploads = dailyRows.map((row) => row.upload.toString())
      const downloads = dailyRows.map((row) => row.download.toString())
      const totals = dailyRows.map((row) => (row.upload + row.download).toString())

      const nodeRows = [...nodeDaily.values()]
      const nodeIds = nodeRows.map((row) => row.nodeId)
      const nodeUserIds = nodeRows.map((row) => row.userId)
      const nodeDates = nodeRows.map((row) => row.date)
      const nodeUploads = nodeRows.map((row) => row.upload.toString())
      const nodeDownloads = nodeRows.map((row) => row.download.toString())

      await db.transaction(async (tx) => {
        // traffic_daily 没有 (user_id, date) 唯一约束（不允许改 schema），
        // 所以用 update + insert-not-exists 代替 ON CONFLICT。
        await tx.execute(sql`
          update traffic_daily t
          set
            upload = t.upload + a.upload,
            download = t.download + a.download,
            total = t.total + a.upload + a.download
          from unnest(
            ${sql.param(userIds)}::uuid[],
            ${sql.param(dates)}::text[],
            ${sql.param(uploads)}::numeric[],
            ${sql.param(downloads)}::numeric[]
          ) as a(user_id, date, upload, download)
          where t.user_id = a.user_id and t.date = a.date
        `)

        await tx.execute(sql`
          insert into traffic_daily (user_id, date, upload, download, total)
          select a.user_id, a.date, a.upload, a.download, a.upload + a.download
          from unnest(
            ${sql.param(userIds)}::uuid[],
            ${sql.param(dates)}::text[],
            ${sql.param(uploads)}::numeric[],
            ${sql.param(downloads)}::numeric[]
          ) as a(user_id, date, upload, download)
          where not exists (
            select 1 from traffic_daily t where t.user_id = a.user_id and t.date = a.date
          )
        `)

        await tx.execute(sql`
          update traffic_daily_node t
          set
            upload = t.upload + a.upload,
            download = t.download + a.download
          from unnest(
            ${sql.param(nodeIds)}::uuid[],
            ${sql.param(nodeUserIds)}::uuid[],
            ${sql.param(nodeDates)}::text[],
            ${sql.param(nodeUploads)}::numeric[],
            ${sql.param(nodeDownloads)}::numeric[]
          ) as a(node_id, user_id, date, upload, download)
          where t.node_id = a.node_id and t.user_id = a.user_id and t.date = a.date
        `)

        await tx.execute(sql`
          insert into traffic_daily_node (node_id, user_id, date, upload, download)
          select a.node_id, a.user_id, a.date, a.upload, a.download
          from unnest(
            ${sql.param(nodeIds)}::uuid[],
            ${sql.param(nodeUserIds)}::uuid[],
            ${sql.param(nodeDates)}::text[],
            ${sql.param(nodeUploads)}::numeric[],
            ${sql.param(nodeDownloads)}::numeric[]
          ) as a(node_id, user_id, date, upload, download)
          where not exists (
            select 1 from traffic_daily_node t
            where t.node_id = a.node_id and t.user_id = a.user_id and t.date = a.date
          )
        `)

        // 每个用户只累加到最近创建的那条 active 订阅，避免多条订阅被重复计数
        const updated = await tx.execute(sql`
          update subscriptions s
          set
            traffic_used = s.traffic_used + a.total,
            upload = s.upload + a.upload,
            download = s.download + a.download,
            updated_at = now()
          from unnest(
            ${sql.param(userIds)}::uuid[],
            ${sql.param(uploads)}::numeric[],
            ${sql.param(downloads)}::numeric[],
            ${sql.param(totals)}::numeric[]
          ) as a(user_id, upload, download, total)
          where s.id = (
            select s2.id
            from subscriptions s2
            where s2.user_id = a.user_id and s2.status = 'active'
            order by s2.created_at desc
            limit 1
          )
          returning s.id
        `)

        subscriptionsUpdated = updated.rows.length
      })
    }

    const meta = {
      cursor: now.toISOString(),
      windowFrom: cursor.toISOString(),
      rows: logRows.length,
      users: daily.size,
      nodes: nodeDaily.size,
      upload: Number(uploadTotal),
      download: Number(downloadTotal),
      total: Number(uploadTotal + downloadTotal),
      subscriptionsUpdated
    }

    return { meta }
  }
}
