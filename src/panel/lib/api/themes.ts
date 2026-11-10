'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiClientError, apiFetch } from './client'

/* ------------------------------------------------------------------ 类型 */

export interface InstalledThemeDto {
  key: string
  name: string
  version: string
  repoUrl: string
  commitSha: string
  installedAt: string
  previewUrl?: string | null
}

export interface ThemeListDto {
  active: string | null
  themes: InstalledThemeDto[]
  builtin: { key: string; name: string }
}

export interface ThemePreviewDto {
  key: string
  name: string
  version: string
  description?: string | null
  author?: string | null
  basePath: string
  routes: string[]
  warnings: string[]
}

export interface ThemeInstallResultDto {
  key: string
  name: string
  version: string
  commitSha: string
}

export interface DiscoverThemeItemDto {
  fullName: string
  description: string | null
  stars: number
  updatedAt: string
  defaultBranch: string
  htmlUrl: string
  installed: boolean
  installedKey: string | null
}

export interface DiscoverThemesDto {
  items: DiscoverThemeItemDto[]
}

/* ---------------------------------------------------------------- 工具 */

export const themeKeys = {
  list: ['themes', 'admin'] as const,
  discover: (q: string) => ['themes', 'discover', q] as const
}

/** 后端主题接口还没合并时 Route Handler 不存在，会返回 404 */
export function isBackendMissing(error: unknown) {
  if (!(error instanceof ApiClientError)) return false
  if (error.code === 'THEME_NOT_FOUND') return false
  return error.statusCode === 404 || error.code === 'NOT_FOUND'
}

export function apiErrorMessage(error: unknown, fallback = '请求失败，请稍后重试') {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/* ------------------------------------------------------------------ 查询 */

export function useAdminThemes() {
  return useQuery({
    queryKey: themeKeys.list,
    queryFn: () => apiFetch<ThemeListDto>('/api/v1/admin/themes'),
    retry: false
  })
}

export function useDiscoverThemes() {
  return useMutation({
    mutationFn: (q: string) =>
      apiFetch<DiscoverThemesDto>(
        `/api/v1/admin/themes/discover${q ? `?q=${encodeURIComponent(q)}&source=github` : '?source=github'}`
      )
  })
}

export function usePreviewTheme() {
  return useMutation({
    mutationFn: (repoUrl: string) =>
      apiFetch<ThemePreviewDto>('/api/v1/admin/themes/preview', {
        method: 'POST',
        body: { repoUrl }
      })
  })
}

export function useInstallTheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { repoUrl: string; ref?: string }) =>
      apiFetch<ThemeInstallResultDto>('/api/v1/admin/themes/install', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: themeKeys.list })
      qc.invalidateQueries({ queryKey: ['themes', 'discover'] })
    }
  })
}

export function useActivateTheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ ok: true; active: string | null }>(
        `/api/v1/admin/themes/${encodeURIComponent(key)}/activate`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: themeKeys.list })
    }
  })
}

export function useUninstallTheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ ok: true }>(`/api/v1/admin/themes/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: themeKeys.list })
      qc.invalidateQueries({ queryKey: ['themes', 'discover'] })
    }
  })
}
