export interface ApiErrorPayload {
  statusCode: number
  code: string
  message: string
  data?: Record<string, unknown>
}

export class ApiClientError extends Error {
  constructor(public payload: ApiErrorPayload) {
    super(payload.message)
    this.name = 'ApiClientError'
  }

  get code() {
    return this.payload.code
  }

  get statusCode() {
    return this.payload.statusCode
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/** 前端统一入口：解析契约里的错误结构，401 跳登录 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'same-origin'
  })

  if (response.status === 401 && typeof window !== 'undefined') {
    const next = encodeURIComponent(window.location.pathname)
    window.location.href = `/login?next=${next}`
    throw new ApiClientError({ statusCode: 401, code: 'AUTH_REQUIRED', message: '请先登录' })
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiClientError(
      payload ?? {
        statusCode: response.status,
        code: 'REQUEST_FAILED',
        message: `请求失败（${response.status}）`
      }
    )
  }

  return payload as T
}

export interface ListResponse<T> {
  data: T[]
  meta: { total: number; page?: number; pageSize?: number; hasMore?: boolean }
}

export const queryKeys = {
  overview: ['user', 'overview'] as const,
  plans: (scope: 'public' | 'user' | 'admin') => ['plans', scope] as const,
  plan: (id: string) => ['plan', id] as const,
  orders: (filters?: Record<string, unknown>) => ['orders', filters ?? {}] as const,
  order: (orderNo: string) => ['order', orderNo] as const,
  subscriptions: (filters?: Record<string, unknown>) => ['subscriptions', filters ?? {}] as const,
  subscription: (id: string) => ['subscription', id] as const,
  traffic: (range: string) => ['traffic', range] as const,
  nodes: (filters?: Record<string, unknown>) => ['nodes', filters ?? {}] as const,
  nodeGroups: ['node-groups'] as const,
  certificates: ['node-certificates'] as const,
  users: (filters?: Record<string, unknown>) => ['users', filters ?? {}] as const,
  coupons: ['coupons'] as const,
  logs: (category: string, filters?: Record<string, unknown>) => ['logs', category, filters ?? {}] as const,
  settings: ['settings'] as const,
  plugins: ['plugins'] as const,
  stats: (range: string) => ['stats', range] as const
}
