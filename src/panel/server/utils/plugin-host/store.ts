import { and, arrayContains, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { PluginManifest } from '@sparrow/contracts'
import { pluginEvents, plugins, pluginSources } from '../../../drizzle/schema'
import { useDb } from '../db'
import type { HookEventRecord, HookPluginTarget } from './hooks'

/**
 * 插件数据访问。
 *
 * 表结构见 src/panel/drizzle/schema/plugin.ts（不可修改，本文件只做读写）。
 */

export type PluginRow = typeof plugins.$inferSelect
export type PluginEventRow = typeof pluginEvents.$inferSelect
export type PluginSourceRow = typeof pluginSources.$inferSelect

export interface PluginListQuery {
  page: number
  pageSize: number
  /** 关键词：名称或 key */
  q?: string
  status?: PluginRow['status']
  type?: PluginRow['type']
}

export interface PluginListResult {
  rows: PluginRow[]
  total: number
}

/** 插件列表（分页 + 关键词 + 状态 / 类型过滤） */
export async function listPlugins(query: PluginListQuery): Promise<PluginListResult> {
  const db = useDb()
  const conditions = []

  if (query.q) {
    const keyword = `%${query.q}%`
    conditions.push(or(ilike(plugins.name, keyword), ilike(plugins.key, keyword)))
  }
  if (query.status) {
    conditions.push(eq(plugins.status, query.status))
  }
  if (query.type) {
    conditions.push(eq(plugins.type, query.type))
  }

  const where = conditions.length ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize

  const rows = await db
    .select()
    .from(plugins)
    .where(where)
    .orderBy(asc(plugins.installedAt), asc(plugins.key))
    .limit(query.pageSize)
    .offset(offset)

  const [totalRow] = await db.select({ value: count() }).from(plugins).where(where)

  return { rows, total: totalRow?.value ?? 0 }
}

/** 按 id 取插件 */
export async function getPluginById(id: string): Promise<PluginRow | null> {
  const db = useDb()
  const [row] = await db.select().from(plugins).where(eq(plugins.id, id)).limit(1)
  return row ?? null
}

/** 按 key 取插件 */
export async function getPluginByKey(key: string): Promise<PluginRow | null> {
  const db = useDb()
  const [row] = await db.select().from(plugins).where(eq(plugins.key, key)).limit(1)
  return row ?? null
}

/** 写入插件 */
export async function insertPlugin(data: typeof plugins.$inferInsert): Promise<PluginRow> {
  const db = useDb()
  const [row] = await db.insert(plugins).values(data).returning()

  if (!row) {
    throw new Error('插入插件失败')
  }

  return row
}

/** 更新插件 */
export async function updatePlugin(
  id: string,
  patch: Partial<typeof plugins.$inferInsert>
): Promise<PluginRow | null> {
  const db = useDb()
  const [row] = await db
    .update(plugins)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(plugins.id, id))
    .returning()
  return row ?? null
}

/** 卸载插件（同时清理事件） */
export async function deletePlugin(id: string): Promise<void> {
  const db = useDb()
  await db.delete(pluginEvents).where(eq(pluginEvents.pluginId, id))
  await db.delete(plugins).where(eq(plugins.id, id))
}

/** 插件事件列表 */
export async function listPluginEvents(
  pluginId: string,
  query: { page: number, pageSize: number, status?: PluginEventRow['status'] }
): Promise<{ rows: PluginEventRow[], total: number }> {
  const db = useDb()
  const conditions = [eq(pluginEvents.pluginId, pluginId)]

  if (query.status) {
    conditions.push(eq(pluginEvents.status, query.status))
  }

  const where = and(...conditions)
  const offset = (query.page - 1) * query.pageSize

  const rows = await db
    .select()
    .from(pluginEvents)
    .where(where)
    .orderBy(desc(pluginEvents.createdAt))
    .limit(query.pageSize)
    .offset(offset)

  const [totalRow] = await db.select({ value: count() }).from(pluginEvents).where(where)

  return { rows, total: totalRow?.value ?? 0 }
}

/** 插件调用统计（成功率 / 平均耗时） */
export async function pluginEventStats(pluginId: string): Promise<{
  total: number
  success: number
  error: number
  timeout: number
  avgDurationMs: number
}> {
  const db = useDb()

  const rows = await db
    .select({
      status: pluginEvents.status,
      total: count(),
      avgDuration: sql<number | null>`avg(${pluginEvents.durationMs})`
    })
    .from(pluginEvents)
    .where(eq(pluginEvents.pluginId, pluginId))
    .groupBy(pluginEvents.status)

  const stats = { total: 0, success: 0, error: 0, timeout: 0, avgDurationMs: 0 }
  let durationSum = 0

  for (const row of rows) {
    stats.total += row.total
    if (row.status === 'success') {
      stats.success += row.total
    } else if (row.status === 'error') {
      stats.error += row.total
    } else if (row.status === 'timeout') {
      stats.timeout += row.total
    }
    durationSum += (row.avgDuration ?? 0) * row.total
  }

  if (stats.total > 0) {
    stats.avgDurationMs = Math.round(durationSum / stats.total)
  }

  return stats
}

/** 需要在某 hook 上被调用的插件（已安装 + 声明了该 hook） */
export async function listHookTargets(hook: string): Promise<HookPluginTarget[]> {
  const db = useDb()

  const rows = await db
    .select()
    .from(plugins)
    .where(and(eq(plugins.status, 'installed'), arrayContains(plugins.hooks, [hook])))
    .orderBy(asc(plugins.installedAt), asc(plugins.key))

  return rows.map(row => ({
    pluginId: row.id,
    pluginKey: row.key,
    runtime: row.runtime,
    hooks: row.hooks,
    manifest: row.manifest as unknown as PluginManifest,
    config: row.config,
    installedAt: row.installedAt
  }))
}

/** 写插件事件（plugin_events） */
export async function writePluginEvent(event: HookEventRecord): Promise<void> {
  const db = useDb()

  await db.insert(pluginEvents).values({
    pluginId: event.pluginId,
    hook: event.hook,
    status: event.status,
    durationMs: event.durationMs,
    error: event.error,
    payload: event.payload
  })
}

/* ────────────────────────── 三方源 ────────────────────────── */

/** 三方源列表 */
export async function listPluginSources(): Promise<PluginSourceRow[]> {
  const db = useDb()
  return db.select().from(pluginSources).orderBy(asc(pluginSources.createdAt))
}

/** 按 id 取三方源 */
export async function getPluginSource(id: string): Promise<PluginSourceRow | null> {
  const db = useDb()
  const [row] = await db.select().from(pluginSources).where(eq(pluginSources.id, id)).limit(1)
  return row ?? null
}

/** 新增三方源 */
export async function insertPluginSource(
  data: typeof pluginSources.$inferInsert
): Promise<PluginSourceRow> {
  const db = useDb()
  const [row] = await db.insert(pluginSources).values(data).returning()

  if (!row) {
    throw new Error('新增三方源失败')
  }

  return row
}

/** 更新三方源（同步状态等） */
export async function updatePluginSource(
  id: string,
  patch: Partial<typeof pluginSources.$inferInsert>
): Promise<PluginSourceRow | null> {
  const db = useDb()
  const [row] = await db.update(pluginSources).set(patch).where(eq(pluginSources.id, id)).returning()
  return row ?? null
}

/** 删除三方源 */
export async function deletePluginSource(id: string): Promise<void> {
  const db = useDb()
  await db.delete(pluginSources).where(eq(pluginSources.id, id))
}
