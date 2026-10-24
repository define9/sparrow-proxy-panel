import { PluginStatusSchema, PluginTypeSchema } from '@sparrow/contracts'
import type { PluginStatus, PluginType } from '@sparrow/contracts'

/**
 * 请求参数解析（列表分页 / 过滤）。
 */

export interface PaginationQuery {
  page: number
  pageSize: number
}

/** 分页参数（页码从 1 开始，每页上限 100） */
export function parsePaginationQuery(query: Record<string, unknown>): PaginationQuery {
  const page = Number.parseInt(String(query.page ?? ''), 10)
  const pageSize = Number.parseInt(String(query.pageSize ?? ''), 10)

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20
  }
}

/** 关键词 */
export function parseKeyword(query: Record<string, unknown>): string | undefined {
  const value = query.q
  if (typeof value !== 'string') {
    return undefined
  }
  const keyword = value.trim()
  return keyword ? keyword : undefined
}

/** 插件状态过滤 */
export function parsePluginStatus(value: unknown): PluginStatus | undefined {
  const result = PluginStatusSchema.safeParse(value)
  return result.success ? result.data : undefined
}

/** 插件类型过滤 */
export function parsePluginType(value: unknown): PluginType | undefined {
  const result = PluginTypeSchema.safeParse(value)
  return result.success ? result.data : undefined
}

/** 路由参数里的插件 id */
export function parsePluginId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
