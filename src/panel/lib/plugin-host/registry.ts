import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { plugins } from '@/lib/db/schema'
import { builtinPlugins } from './builtin'
import type { BuiltinPlugin, PluginType } from './types'

/**
 * 内置插件 → plugins 表。
 *
 * ensureBuiltinPlugins() 幂等 upsert：只更新 name / version / manifest，
 * 绝不覆盖管理员改过的 config 与 status（否则重启一次配置就回滚了）。
 */

export type PluginRow = typeof plugins.$inferSelect

export type PluginStatus = PluginRow['status']

function builtinRow(plugin: BuiltinPlugin) {
  return {
    key: plugin.key,
    name: plugin.name,
    version: plugin.version,
    type: plugin.type,
    sourceType: 'builtin',
    repoUrl: `builtin://${plugin.key}`,
    commitSha: 'builtin',
    status: 'installed' as const,
    manifest: JSON.stringify(plugin.manifest)
  }
}

async function upsertBuiltinPlugins(): Promise<void> {
  for (const plugin of builtinPlugins) {
    const values = builtinRow(plugin)
    await db
      .insert(plugins)
      .values(values)
      .onConflictDoUpdate({
        target: plugins.key,
        set: {
          name: values.name,
          version: values.version,
          manifest: values.manifest,
          updatedAt: new Date()
        }
      })
  }
}

// 进程内只跑一次；失败时清掉缓存，下一次调用重试（懒加载兜底要能自愈）
let ensurePromise: Promise<void> | null = null

export async function ensureBuiltinPlugins(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = upsertBuiltinPlugins().catch((error: unknown) => {
      ensurePromise = null
      throw error
    })
  }
  return ensurePromise
}

/* ------------------------------ 插件行读写 ------------------------------ */

export async function listPluginRows(type: PluginType): Promise<PluginRow[]> {
  return db
    .select()
    .from(plugins)
    .where(eq(plugins.type, type))
    .orderBy(asc(plugins.installedAt), asc(plugins.key))
}

export async function getPluginRow(key: string): Promise<PluginRow | undefined> {
  const [row] = await db.select().from(plugins).where(eq(plugins.key, key)).limit(1)
  return row
}

export interface PluginRowPatch {
  config?: string
  status?: PluginStatus
}

/** 只写配置与状态：安装元信息归 ensureBuiltinPlugins() 管 */
export async function updatePluginRow(key: string, patch: PluginRowPatch): Promise<void> {
  if (patch.config === undefined && patch.status === undefined) return
  await db
    .update(plugins)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(plugins.key, key))
}
