import 'server-only'
import { ApiError } from '@/lib/api/response'

/**
 * Agent 发布元信息：**面板不存储，只代理 GitHub Release**。
 *
 * 为什么不存 DB：
 *   版本号、下载地址、sha256 都是「发布的真相」，真相在 GitHub Release 里
 *   （tag 前缀 `agent/`，每个 asset 自带 `digest: sha256:...`）。
 *   面板再存一份到 settings 表，就必然出现「面板说 0.1.0、GitHub 已经 0.2.0」的
 *   双写不一致；而且 DB 重建/换机器就丢，多套面板要各写一遍。
 *
 * 所以这里只做**带 TTL 的内存缓存**——缓存不是存储，进程重启就忘，不影响正确性，
 * 但能把节点侧的并发与 GitHub 的限流（未认证 60 次/小时/IP）隔开。
 *
 * 可配置项（环境变量，都不是「发布数据」）：
 *   AGENT_RELEASE_REPO   GitHub 仓库，默认 define9/sparrow-proxy-panel
 *   AGENT_RELEASE_TTL    缓存秒数，默认 600
 */

export const AGENT_INSTALL_SCRIPT = '/agent/install.sh'

const DEFAULT_REPO = 'define9/sparrow-proxy-panel'
const TAG_PREFIX = 'agent/'
const DEFAULT_TTL_SECONDS = 600

export interface AgentReleaseAsset {
  /** 绝对下载地址（GitHub Release 的 browser_download_url） */
  url: string
  /** 小写 64 位十六进制 */
  sha256: string
  /** 字节数，便于前端展示 */
  size?: number
}

export type AgentReleaseSource = 'github' | 'none'

export interface AgentReleaseView {
  version: string
  channel: string
  source: AgentReleaseSource
  repo: string
  tag: string
  assets: Record<string, AgentReleaseAsset>
  installScript: string
  signature: string
  /** 数据抓取时间（ISO8601），便于排查缓存是否过期 */
  fetchedAt: string | null
}

export interface AgentReleaseAdminView extends AgentReleaseView {
  configured: boolean
  platforms: string[]
  /** 缓存是否命中 */
  cached: boolean
}

/** GitHub Release API 的子集 */
interface GithubAsset {
  name?: unknown
  browser_download_url?: unknown
  digest?: unknown
  size?: unknown
}

interface GithubRelease {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
  published_at?: unknown
  assets?: unknown
}

const SHA256_RE = /^[0-9a-f]{64}$/i
const TAG_VERSION_RE = /(?:^|\/)v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/

function repoName(): string {
  return (process.env.AGENT_RELEASE_REPO ?? DEFAULT_REPO).trim() || DEFAULT_REPO
}

function ttlMs(): number {
  const raw = Number(process.env.AGENT_RELEASE_TTL)
  const seconds = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TTL_SECONDS
  return seconds * 1000
}

/** agent/v0.1.0 → 0.1.0；识别不出来返回空串 */
export function versionFromTag(tag: string): string {
  const match = TAG_VERSION_RE.exec(tag.trim())
  return match?.[1] ?? ''
}

/** sparrow-agent-linux-amd64 / sparrow-agent-windows-amd64.exe → linux-amd64 / windows-amd64 */
export function platformFromAssetName(name: string): string | null {
  const match = /^sparrow-agent-([a-z0-9]+(?:-[a-z0-9]+)?)(?:\.exe)?$/i.exec(name.trim())
  if (!match) return null
  const platform = match[1].toLowerCase()
  // 至少形如 <os>-<arch>
  return platform.includes('-') ? platform : null
}

/** GitHub 的 digest 字段形如 "sha256:abc…"，取出 hex */
function sha256FromDigest(digest: unknown): string {
  if (typeof digest !== 'string') return ''
  const value = digest.trim().toLowerCase()
  const hex = value.startsWith('sha256:') ? value.slice('sha256:'.length) : value
  return SHA256_RE.test(hex) ? hex : ''
}

const EMPTY: AgentReleaseView = {
  version: '',
  channel: 'stable',
  source: 'none',
  repo: '',
  tag: '',
  assets: {},
  installScript: AGENT_INSTALL_SCRIPT,
  signature: '',
  fetchedAt: null
}

/**
 * 把 GitHub Release 响应标准化成面板对外的元信息。
 * 纯函数，便于单测。
 */
export function normalizeGithubRelease(
  releases: unknown,
  options: { repo?: string; channel?: 'stable' | 'beta' } = {}
): AgentReleaseView {
  const repo = options.repo ?? repoName()
  const channel = options.channel ?? 'stable'

  if (!Array.isArray(releases)) return { ...EMPTY, repo: '', tag: '' }

  const candidates = (releases as GithubRelease[])
    .filter((release) => {
      const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
      if (!tag.startsWith(TAG_PREFIX)) return false
      if (release.draft === true) return false
      // stable 通道不推 prerelease
      if (channel === 'stable' && release.prerelease === true) return false
      return true
    })
    .sort((a, b) => {
      const ta = typeof a.published_at === 'string' ? Date.parse(a.published_at) : 0
      const tb = typeof b.published_at === 'string' ? Date.parse(b.published_at) : 0
      return tb - ta
    })

  const release = candidates[0]
  if (!release) return { ...EMPTY, repo }

  const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
  const assets: Record<string, AgentReleaseAsset> = {}

  const rawAssets = Array.isArray(release.assets) ? (release.assets as GithubAsset[]) : []
  for (const asset of rawAssets) {
    const name = typeof asset.name === 'string' ? asset.name : ''
    const platform = platformFromAssetName(name)
    if (!platform) continue

    const url = typeof asset.browser_download_url === 'string' ? asset.browser_download_url : ''
    const sha256 = sha256FromDigest(asset.digest)
    if (!url || !sha256) continue

    assets[platform] = {
      url,
      sha256,
      size: typeof asset.size === 'number' ? asset.size : undefined
    }
  }

  // 没有任何可用资产 → 视为未配置（install.sh 会去试旧路径或让用户手动指定）
  if (Object.keys(assets).length === 0) return { ...EMPTY, repo, tag }

  return {
    version: versionFromTag(tag),
    channel,
    source: 'github',
    repo,
    tag,
    assets,
    installScript: AGENT_INSTALL_SCRIPT,
    signature: '',
    fetchedAt: new Date().toISOString()
  }
}

/* ---------------- 缓存 ---------------- */

interface CacheEntry {
  at: number
  data: AgentReleaseView
}

/** 挂在 globalThis：Next 的 proxy 与 route handler 是独立模块图，模块级变量互不可见 */
const globalForRelease = globalThis as unknown as { __sparrowAgentRelease?: CacheEntry | null }
if (globalForRelease.__sparrowAgentRelease === undefined) {
  globalForRelease.__sparrowAgentRelease = null
}

/** 测试/发布后手动失效 */
export function invalidateAgentReleaseCache(): void {
  globalForRelease.__sparrowAgentRelease = null
}

async function fetchFromGithub(repo: string, channel: 'stable' | 'beta'): Promise<AgentReleaseView> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=30`
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28'
  }
  // 可选：提高限额（公开仓库不填也能用，60 次/小时/IP）
  const token = process.env.GITHUB_TOKEN
  if (token) headers.authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
      cache: 'no-store'
    })
  } catch (error) {
    throw new ApiError(
      503,
      'AGENT_RELEASE_UNAVAILABLE',
      `面板无法访问 GitHub API（${repo}）：${error instanceof Error ? error.message : String(error)}。` +
        '可在节点上改用 --manifest 或 --from-url 手动指定二进制。'
    )
  }

  if (response.status === 404) {
    throw new ApiError(
      503,
      'AGENT_RELEASE_UNAVAILABLE',
      `GitHub 仓库不存在或不可访问：${repo}。私有仓库需要配置 GITHUB_TOKEN。`
    )
  }

  if (response.status === 403 || response.status === 429) {
    throw new ApiError(
      503,
      'AGENT_RELEASE_RATE_LIMITED',
      'GitHub API 触发限流（未认证 60 次/小时/IP）。可配置 GITHUB_TOKEN，或改用 --from-url。'
    )
  }

  if (!response.ok) {
    throw new ApiError(
      503,
      'AGENT_RELEASE_UNAVAILABLE',
      `GitHub API 返回 ${response.status}。可在节点上改用 --manifest 或 --from-url。`
    )
  }

  const payload: unknown = await response.json().catch(() => null)
  return normalizeGithubRelease(payload, { repo, channel })
}

async function resolve(channel: 'stable' | 'beta'): Promise<AgentReleaseView> {
  const cache = globalForRelease.__sparrowAgentRelease
  if (cache && Date.now() - cache.at < ttlMs()) return cache.data

  const repo = repoName()
  const data = await fetchFromGithub(repo, channel)
  globalForRelease.__sparrowAgentRelease = { at: Date.now(), data }
  return data
}

/** 公开视图：给 install.sh 与节点检查更新用。GitHub 不可达时抛 503（不是静默返回空）。 */
export async function getAgentRelease(channel: 'stable' | 'beta' = 'stable'): Promise<AgentReleaseView> {
  return resolve(channel)
}

/** 管理端视图：多带 platforms / configured / cached */
export async function getAgentReleaseAdmin(): Promise<AgentReleaseAdminView> {
  const cache = globalForRelease.__sparrowAgentRelease
  const data = await resolve('stable')
  return {
    ...data,
    configured: data.source !== 'none',
    platforms: Object.keys(data.assets).sort(),
    cached: Boolean(cache && Date.now() - cache.at < ttlMs())
  }
}
