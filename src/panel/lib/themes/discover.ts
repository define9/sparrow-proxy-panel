import 'server-only'
import { eq } from 'drizzle-orm'
import { ApiError } from '@/lib/api/response'
import { db } from '@/lib/db'
import { plugins } from '@/lib/db/schema'

/**
 * GitHub 主题发现：按 topic `sparrow-proxy-theme` 搜索社区主题仓库。
 *
 * 发现只负责「有哪些仓库可装」，点进去仍然走同一条安装流水线（§4）。
 * GitHub API 不可用时必须返回可读错误，前端仍可手动填 git 地址安装。
 */

export const THEME_GITHUB_TOPIC = 'sparrow-proxy-theme'

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories'
const GITHUB_TIMEOUT_MS = 10_000
const PER_PAGE = 30

export interface DiscoveredTheme {
  fullName: string
  description: string
  stars: number
  updatedAt: string
  defaultBranch: string
  htmlUrl: string
  /** 本机是否已安装（按 owner/repo 匹配 plugins.repo_url） */
  installed: boolean
  installedKey: string | null
}

export interface ThemeDiscoverResult {
  source: 'github' | 'releases'
  items: DiscoveredTheme[]
  total: number
  /** releases 发现未实现时明确标注，不伪造数据 */
  implemented: boolean
  note?: string
}

interface GithubRepoItem {
  full_name?: string
  description?: string | null
  stargazers_count?: number
  updated_at?: string
  default_branch?: string
  html_url?: string
}

interface GithubSearchResponse {
  total_count?: number
  items?: GithubRepoItem[]
  message?: string
}

/** 归一化仓库地址：小写、去 .git、去尾斜杠，用于判断「本机是否已装」 */
export function normalizeRepoUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
}

async function installedRepoMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ key: plugins.key, repoUrl: plugins.repoUrl })
    .from(plugins)
    .where(eq(plugins.type, 'theme'))

  const map = new Map<string, string>()
  for (const row of rows) map.set(normalizeRepoUrl(row.repoUrl), row.key)
  return map
}

/**
 * 按 GitHub topic 搜索主题仓库。
 * q 非空时追加到搜索词（`topic:sparrow-proxy-theme <q>`）。
 */
export async function discoverThemesFromGithub(q?: string): Promise<ThemeDiscoverResult> {
  const keyword = q?.trim() ?? ''
  const query = keyword ? `topic:${THEME_GITHUB_TOPIC} ${keyword}` : `topic:${THEME_GITHUB_TOPIC}`

  const url = new URL(GITHUB_SEARCH_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('sort', 'updated')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', String(PER_PAGE))

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'sparrow-proxy-panel'
  }
  const token = process.env.GITHUB_TOKEN?.trim()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS)
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ApiError(
      502,
      'THEME_DISCOVER_FAILED',
      `无法连接 GitHub API（${reason}）：可以稍后重试，或直接手动填写 Git 仓库地址安装`
    )
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as GithubSearchResponse
    const detail = body.message ?? response.statusText
    const hint =
      response.status === 403 || response.status === 429
        ? '（GitHub 搜索接口限流：可配置 GITHUB_TOKEN 提高限额，或稍后重试）'
        : ''
    throw new ApiError(
      502,
      'THEME_DISCOVER_FAILED',
      `GitHub 主题发现失败：HTTP ${response.status} ${detail}${hint}；仍可手动填写 Git 仓库地址安装`
    )
  }

  const body = (await response.json().catch(() => null)) as GithubSearchResponse | null
  if (!body || !Array.isArray(body.items)) {
    throw new ApiError(
      502,
      'THEME_DISCOVER_FAILED',
      'GitHub 返回了无法解析的响应；仍可手动填写 Git 仓库地址安装'
    )
  }

  const installed = await installedRepoMap()

  const items: DiscoveredTheme[] = body.items.map((item) => {
    const fullName = item.full_name ?? ''
    const candidates = [
      normalizeRepoUrl(`https://github.com/${fullName}`),
      normalizeRepoUrl(item.html_url ?? '')
    ]
    const installedKey = candidates.map((key) => installed.get(key)).find(Boolean) ?? null

    return {
      fullName,
      description: item.description ?? '',
      stars: item.stargazers_count ?? 0,
      updatedAt: item.updated_at ?? '',
      defaultBranch: item.default_branch ?? 'main',
      htmlUrl: item.html_url ?? `https://github.com/${fullName}`,
      installed: installedKey !== null,
      installedKey
    }
  })

  return {
    source: 'github',
    items,
    total: body.total_count ?? items.length,
    implemented: true
  }
}

/**
 * 按 release tag 发现：需要维护一份已知索引源才能遍历，
 * 当前未实现——返回空数组并明确标注，不伪造数据。
 */
export async function discoverThemesFromReleases(): Promise<ThemeDiscoverResult> {
  return {
    source: 'releases',
    items: [],
    total: 0,
    implemented: false,
    note: '按 release tag 发现尚未实现（需要先有主题索引源）；请使用 source=github 或手动填写 Git 地址安装'
  }
}

export async function discoverThemes(source: string | null | undefined, q?: string) {
  if (source === 'releases') return discoverThemesFromReleases()
  return discoverThemesFromGithub(q)
}
