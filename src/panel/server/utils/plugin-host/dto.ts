import type { Plugin, PluginSource } from '@sparrow/contracts'
import type { PluginEventRow, PluginRow, PluginSourceRow } from './store'

/**
 * 数据库行 → 契约 DTO。
 *
 * 契约里的时间是 ISO 字符串（DateTimeSchema），数据库里是 Date，这里统一转换。
 */

/** 插件 DTO（契约 PluginSchema） */
export function toPluginDto(row: PluginRow): Plugin {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    version: row.version,
    type: row.type,
    runtime: row.runtime,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    checksum: row.checksum,
    permissions: row.permissions,
    hooks: row.hooks,
    status: row.status,
    error: row.error,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }
}

/** 三方源 DTO（契约 PluginSourceSchema） */
export function toPluginSourceDto(row: PluginSourceRow): PluginSource {
  return {
    id: row.id,
    name: row.name,
    // 数据库枚举 plugin_source_type 比契约多 builtin / upload；
    // TODO: 契约与表结构枚举不一致，等契约补齐后再收紧类型
    type: row.type as PluginSource['type'],
    url: row.url,
    enabled: row.enabled,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    checksum: row.checksum,
    createdAt: row.createdAt.toISOString()
  }
}

/** 插件事件 DTO（plugin_events） */
export function toPluginEventDto(row: PluginEventRow) {
  return {
    id: row.id,
    pluginId: row.pluginId,
    hook: row.hook,
    status: row.status,
    durationMs: row.durationMs,
    error: row.error,
    payload: row.payload,
    createdAt: row.createdAt.toISOString()
  }
}

/** 分页元信息（契约 PaginationMetaSchema） */
export function toPageMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    nextCursor: null
  }
}
