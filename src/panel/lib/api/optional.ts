import { apiFetch } from './client'

/**
 * 可选依赖的接口（由其他任务/插件提供）：404、403 或网络失败统一返回 null，
 * 调用方回退到空数据，不在页面上抛错误。
 */
export async function fetchOptional<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path)
  } catch {
    return null
  }
}

/** 兼容 `{ data: [] }` 与裸数组两种列表响应 */
export function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data
    if (Array.isArray(data)) return data as T[]
  }
  return []
}
