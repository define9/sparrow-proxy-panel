'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiFetch, queryKeys, type ListResponse } from '@/lib/api/client'

/**
 * 菜单悬停预取。
 *
 * 境外部署时一次点击要经历「下载 chunk → 发 API」两段往返，
 * 悬停就把两件事都做完，点击时基本是瞬开。
 *
 * 只预取最常见的列表页（默认筛选条件），命中即用，不再重复请求。
 */
const warmed = new Set<string>()

type Prefetcher = (prefetch: ReturnType<typeof useQueryClient>['prefetchQuery']) => Promise<unknown>

const prefetchers: Record<string, Prefetcher> = {
  '/dashboard': (prefetch) =>
    prefetch({ queryKey: queryKeys.overview, queryFn: () => apiFetch('/api/v1/user/overview') }),
  '/dashboard/plans': (prefetch) =>
    prefetch({
      queryKey: queryKeys.plans('user'),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/user/plans')
    }),
  '/dashboard/orders': (prefetch) =>
    prefetch({
      queryKey: queryKeys.orders(),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/user/orders')
    }),
  '/dashboard/subscriptions': (prefetch) =>
    prefetch({
      queryKey: queryKeys.subscriptions(),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/user/subscriptions')
    }),
  '/dashboard/traffic': (prefetch) =>
    prefetch({
      queryKey: queryKeys.traffic('30d'),
      queryFn: () => apiFetch<unknown[]>('/api/v1/user/traffic?range=30d')
    }),
  '/admin': (prefetch) =>
    prefetch({
      queryKey: queryKeys.stats('overview'),
      queryFn: () => apiFetch('/api/v1/admin/stats/overview')
    }),
  '/admin/plans': (prefetch) =>
    prefetch({
      queryKey: queryKeys.plans('admin'),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/admin/plans')
    }),
  '/admin/orders': (prefetch) =>
    prefetch({
      queryKey: queryKeys.orders({ scope: 'admin' }),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/admin/orders')
    }),
  '/admin/subscriptions': (prefetch) =>
    prefetch({
      queryKey: queryKeys.subscriptions({ scope: 'admin' }),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/admin/subscriptions')
    }),
  '/admin/users': (prefetch) =>
    prefetch({
      queryKey: queryKeys.users(),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/admin/users')
    }),
  '/admin/nodes': (prefetch) =>
    prefetch({
      queryKey: queryKeys.nodes(),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/admin/nodes')
    }),
  '/admin/logs': (prefetch) =>
    prefetch({
      queryKey: queryKeys.logs('audit'),
      queryFn: () => apiFetch<ListResponse<unknown>>('/api/v1/admin/logs/audit')
    }),
  '/admin/settings': (prefetch) =>
    prefetch({
      queryKey: queryKeys.settings,
      queryFn: () => apiFetch('/api/v1/admin/settings')
    })
}

export function usePrefetchRoute() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useCallback(
    (href: string) => {
      // 路由 chunk 预取（Next 自带，显式调用保证动态路由也生效）
      try {
        router.prefetch(href)
      } catch {
        // 忽略：预取失败不影响正常导航
      }

      if (warmed.has(href)) return
      const run = prefetchers[href]
      if (!run) return

      warmed.add(href)
      void run(queryClient.prefetchQuery).catch(() => {
        // 预取失败（未登录/网络抖）不打扰用户，点击时会重新请求
        warmed.delete(href)
      })
    },
    [queryClient, router]
  )
}
