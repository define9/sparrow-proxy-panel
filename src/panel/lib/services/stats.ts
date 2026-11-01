import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export interface OverviewStats {
  users: { total: number; newToday: number }
  revenue: { today: string; month: string }
  orders: { today: number; pending: number }
  subscriptions: { active: number; expiring: number }
  nodes: { total: number; online: number }
  traffic: { today: number; month: number }
}

export interface TrafficPoint {
  date: string
  upload: number
  download: number
  total: number
}

export interface RevenuePoint {
  date: string
  amount: number
}

function toInt(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function toBytes(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function toMoney(value: unknown) {
  const n = Number(value ?? 0)
  return (Number.isFinite(n) ? n : 0).toFixed(2)
}

function dayString(offsetDays: number) {
  const date = new Date(Date.now() - offsetDays * 86_400_000)
  return date.toISOString().slice(0, 10)
}

/** 所有指标一条 SQL 聚合；没数据的分支由 coalesce/子查询兜底为 0 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const { rows } = await db.execute(sql`
    select
      (select count(*) from users) as users_total,
      (select count(*) from users where created_at >= current_date) as users_new_today,
      (select coalesce(sum(amount), 0) from orders
        where status = 'paid' and paid_at >= current_date) as revenue_today,
      (select coalesce(sum(amount), 0) from orders
        where status = 'paid' and paid_at >= date_trunc('month', current_date)) as revenue_month,
      (select count(*) from orders where created_at >= current_date) as orders_today,
      (select count(*) from orders where status = 'pending') as orders_pending,
      (select count(*) from subscriptions where status = 'active') as subs_active,
      (select count(*) from subscriptions
        where status = 'active' and expire_at <= now() + interval '7 days') as subs_expiring,
      (select count(*) from nodes) as nodes_total,
      (select count(*) from nodes where status = 'online') as nodes_online,
      (select coalesce(sum(total), 0) from traffic_daily
        where date = to_char(current_date, 'YYYY-MM-DD')) as traffic_today,
      (select coalesce(sum(total), 0) from traffic_daily
        where date >= to_char(date_trunc('month', current_date), 'YYYY-MM-DD')) as traffic_month
  `)

  const row = (rows[0] ?? {}) as Record<string, unknown>

  return {
    users: { total: toInt(row.users_total), newToday: toInt(row.users_new_today) },
    revenue: { today: toMoney(row.revenue_today), month: toMoney(row.revenue_month) },
    orders: { today: toInt(row.orders_today), pending: toInt(row.orders_pending) },
    subscriptions: { active: toInt(row.subs_active), expiring: toInt(row.subs_expiring) },
    nodes: { total: toInt(row.nodes_total), online: toInt(row.nodes_online) },
    traffic: { today: toBytes(row.traffic_today), month: toBytes(row.traffic_month) }
  }
}

/** 按天聚合流量；traffic_daily 为空时返回 [] */
export async function getTrafficSeries(days: number): Promise<TrafficPoint[]> {
  const since = dayString(Math.max(days - 1, 0))
  const { rows } = await db.execute(sql`
    select
      date,
      coalesce(sum(upload), 0) as upload,
      coalesce(sum(download), 0) as download,
      coalesce(sum(total), 0) as total
    from traffic_daily
    where date >= ${since}
    group by date
    order by date asc
  `)

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    date: String(row.date),
    upload: toBytes(row.upload),
    download: toBytes(row.download),
    total: toBytes(row.total)
  }))
}

/** 近 N 天实收金额，缺失日期补 0，保证折线连续 */
export async function getRevenueSeries(days: number): Promise<RevenuePoint[]> {
  const since = dayString(Math.max(days - 1, 0))
  const { rows } = await db.execute(sql`
    select
      to_char(paid_at::date, 'YYYY-MM-DD') as date,
      coalesce(sum(amount), 0) as amount
    from orders
    where status = 'paid' and paid_at >= ${since}::date
    group by paid_at::date
    order by paid_at::date asc
  `)

  const byDate = new Map<string, number>()
  for (const row of rows as Array<Record<string, unknown>>) {
    byDate.set(String(row.date), Number(row.amount ?? 0))
  }

  return Array.from({ length: days }, (_, index) => {
    const date = dayString(days - 1 - index)
    return { date, amount: byDate.get(date) ?? 0 }
  })
}
