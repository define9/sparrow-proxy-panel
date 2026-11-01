'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys, type ListResponse } from './client'

/* ------------------------------------------------------------------ 类型 */

export interface AdminUserDto {
  id: string
  email: string
  username: string
  roleCode: string
  roleName: string | null
  status: 'active' | 'disabled' | 'pending'
  balance: string
  trafficLimit: number
  trafficUsed: number
  remark: string | null
  twofaEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  subscriptionCount: number
}

export interface UserSessionDto {
  id: string
  ip: string | null
  userAgent: string | null
  current: boolean
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

export interface CouponDto {
  id: string
  code: string
  type: 'fixed' | 'percent'
  value: string
  quota: number
  usedCount: number
  minAmount: string
  enabled: boolean
  expiresAt: string | null
  createdAt: string
}

export type LogCategory = 'audit' | 'login' | 'task' | 'agent'
export type LogLevel = 'info' | 'warn' | 'error'

export interface AdminLogDto {
  id: string
  category: LogCategory
  level: LogLevel
  actor: string
  action: string
  target: string
  ip: string | null
  message: string
  createdAt: string
  payload: Record<string, unknown>
}

export interface SettingsDto {
  site: { name: string; logo: string; announcement: string; icp: string }
  register: { open: boolean; emailVerify: boolean; giftTrafficGb: number; inviteRequired: boolean }
  payment: { epayEnabled: boolean; stripeEnabled: boolean }
  mail: { host: string; port: number; username: string; password: string; hasPassword?: boolean }
}

export interface PluginJobDto {
  id: string
  key: string
  cron: string
  handler: string
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  lastStatus: 'success' | 'failed' | 'skipped'
  durationMs: number
}

export interface PluginEventDto {
  id: string
  at: string
  level: LogLevel
  message: string
  payload: unknown
}

export interface PluginConfigFieldDto {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'switch'
  value: string
  secret: boolean
}

export type PluginType = 'payment' | 'node_source' | 'subscription' | 'notify' | 'hook' | 'ui'
export type PluginStatus = 'installed' | 'disabled' | 'error' | 'installing'
export type PluginHealth = 'healthy' | 'unhealthy' | 'unknown'

export interface PluginDto {
  id: string
  key: string
  name: string
  version: string
  type: PluginType
  status: PluginStatus
  health: PluginHealth
  repoUrl: string
  gitRef: string | null
  commitSha: string
  runtime: string
  entry: string
  build: string
  uiMode: string
  signed: boolean
  permissions: string[]
  grantedScopes: string[]
  egress: string[]
  hooks: string[]
  description: string
  author: string
  compatibility: string
  activeVersion: string | null
  previousVersion: string | null
  lastError: string | null
  lastHealthAt: string | null
  installedAt: string
  updatedAt: string
  jobCount?: number
}

export interface PluginDetailDto extends PluginDto {
  config: PluginConfigFieldDto[]
  jobs: PluginJobDto[]
  events: PluginEventDto[]
}

export interface PluginSourceDto {
  id: string
  name: string
  type: 'url' | 'git' | 'marketplace'
  url: string
  enabled: boolean
  lastSyncedAt: string | null
  status: 'healthy' | 'error' | 'unknown'
  lastError: string | null
  createdAt: string
}

/* ---------------------------------------------------------------- 工具 */

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/* ------------------------------------------------------------------ 用户 */

export function useAdminUsers(filters: { q?: string; role?: string; status?: string; page?: number }) {
  return useQuery({
    queryKey: queryKeys.users(filters),
    queryFn: () =>
      apiFetch<ListResponse<AdminUserDto>>(
        `/api/v1/admin/users${buildQuery({
          q: filters.q,
          role: filters.role === 'all' ? undefined : filters.role,
          status: filters.status === 'all' ? undefined : filters.status,
          page: filters.page
        })}`
      )
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      username?: string
      roleCode?: string
      status?: 'active' | 'disabled' | 'pending'
      remark?: string | null
    }) => apiFetch<AdminUserDto>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

export function useAdjustBalance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: string; reason: string }) =>
      apiFetch<{ id: string; balance: string }>(`/api/v1/admin/users/${id}/balance`, {
        method: 'POST',
        body: { amount, reason }
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

export function useUserSessions(userId: string | null) {
  return useQuery({
    queryKey: ['user-sessions', userId],
    enabled: Boolean(userId),
    queryFn: () => apiFetch<UserSessionDto[]>(`/api/v1/admin/users/${userId}/sessions`)
  })
}

export function useKickSession(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sid: string) =>
      apiFetch<void>(`/api/v1/admin/users/${userId}/sessions/${sid}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-sessions', userId] })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

/* -------------------------------------------------------------- 优惠券 */

export function useCoupons(filters: { q?: string } = {}) {
  return useQuery({
    queryKey: [...queryKeys.coupons, filters],
    queryFn: () =>
      apiFetch<ListResponse<CouponDto>>(`/api/v1/admin/coupons${buildQuery({ q: filters.q })}`)
  })
}

export interface CouponInput {
  code: string
  type: 'fixed' | 'percent'
  value: number
  quota: number
  minAmount: number
  expiresAt: string | null
}

export function useCreateCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CouponInput) =>
      apiFetch<CouponDto>('/api/v1/admin/coupons', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.coupons })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

export function useUpdateCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<CouponInput> & { id: string; enabled?: boolean }) =>
      apiFetch<CouponDto>(`/api/v1/admin/coupons/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.coupons })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

export function useDeleteCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/v1/admin/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.coupons })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

/* ------------------------------------------------------------------ 日志 */

export function useAdminLogs(
  category: LogCategory,
  filters: { q?: string; level?: string; range?: string; page?: number }
) {
  const path = category === 'task' ? 'tasks' : category
  return useQuery({
    queryKey: queryKeys.logs(category, filters),
    queryFn: () =>
      apiFetch<ListResponse<AdminLogDto>>(
        `/api/v1/admin/logs/${path}${buildQuery({
          q: filters.q,
          level: filters.level === 'all' ? undefined : filters.level,
          range: filters.range,
          page: filters.page
        })}`
      )
  })
}

/* ------------------------------------------------------------------ 设置 */

export function useAdminSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiFetch<SettingsDto>('/api/v1/admin/settings')
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<SettingsDto>) =>
      apiFetch<SettingsDto>('/api/v1/admin/settings', { method: 'PUT', body }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.settings, data)
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}

/* ------------------------------------------------------------------ 插件 */

export function useAdminPlugins(filters: { q?: string } = {}) {
  return useQuery({
    queryKey: [...queryKeys.plugins, filters],
    queryFn: () =>
      apiFetch<ListResponse<PluginDto>>(`/api/v1/admin/plugins${buildQuery({ q: filters.q })}`)
  })
}

export function usePluginDetail(key: string | null) {
  return useQuery({
    queryKey: ['plugin', key],
    enabled: Boolean(key),
    queryFn: () => apiFetch<PluginDetailDto>(`/api/v1/admin/plugins/${key}`)
  })
}

export function useInstallPlugin() {
  return useMutation({
    mutationFn: (body: { repoUrl: string }) =>
      apiFetch<{ taskId: string }>('/api/v1/admin/plugins/install', { method: 'POST', body })
  })
}

export function usePluginSources(filters: { q?: string } = {}) {
  return useQuery({
    queryKey: ['plugin-sources', filters],
    queryFn: () =>
      apiFetch<ListResponse<PluginSourceDto>>(
        `/api/v1/admin/plugin-sources${buildQuery({ q: filters.q })}`
      )
  })
}

export function useCreatePluginSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; type: PluginSourceDto['type']; url: string; enabled: boolean }) =>
      apiFetch<PluginSourceDto>('/api/v1/admin/plugin-sources', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plugin-sources'] })
      qc.invalidateQueries({ queryKey: ['logs'] })
    }
  })
}
