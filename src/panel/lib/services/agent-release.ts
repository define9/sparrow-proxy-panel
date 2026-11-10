import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { parseJson } from '@/lib/api/admin-ops'

/**
 * Agent 发布源（面板只提供元信息，二进制不经过面板）。
 *
 * 数据由发布流程写入 settings 表（key = agent_release），面板只读：
 *
 *   { "source": "github", "repo": "define9/sparrow-proxy-panel",
 *     "tag": "agent/v0.1.0",
 *     "assets": { "linux-amd64": { "url": "https://github.com/...", "sha256": "<64hex>" } } }
 *
 * 写入方：src/panel/scripts/publish-agent-release.mjs（发布脚本产出 panel-release.json 后调用）。
 * 读取方：GET /api/v1/public/agent/release（install.sh / 节点）、管理端接口。
 *
 * 未配置或配置损坏时返回 source: 'none' + 空 assets，前端据此提示，绝不 500。
 */

export const AGENT_RELEASE_KEY = 'agent_release'
export const AGENT_INSTALL_SCRIPT = '/agent/install.sh'

/** 记录在 settings 里的原始结构（发布脚本写入） */
export interface StoredAgentRelease {
  source?: string
  repo?: string
  tag?: string
  version?: string
  channel?: string
  assets?: Record<string, unknown>
  installScript?: string
  signature?: string
}

export interface AgentReleaseAsset {
  url: string
  sha256: string
}

export type AgentReleaseSource = 'github' | 'custom-url' | 'none'

export interface AgentReleaseView {
  version: string
  channel: string
  source: AgentReleaseSource
  repo: string
  tag: string
  assets: Record<string, AgentReleaseAsset>
  installScript: string
  signature: string
}

export interface AgentReleaseAdminView extends AgentReleaseView {
  configured: boolean
  platforms: string[]
  updatedAt: string | null
}

const FALLBACK: AgentReleaseView = {
  version: '',
  channel: 'stable',
  source: 'none',
  repo: '',
  tag: '',
  assets: {},
  installScript: AGENT_INSTALL_SCRIPT,
  signature: ''
}

const SHA256_RE = /^[0-9a-f]{64}$/i

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * agent/v0.1.0 → 0.1.0
 * v0.1.0 / 0.1.0 / 1.0.0-beta.1 也要认；识别不出来返回空串（不抛错）
 */
export function versionFromTag(tag: string): string {
  const match = /(?:^|\/)v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(tag.trim())
  return match?.[1] ?? ''
}

/** 只保留「有 url + 64 位 sha256」的条目，脏数据不至于让线上安装拿错东西 */
function normalizeAssets(raw: unknown): Record<string, AgentReleaseAsset> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const assets: Record<string, AgentReleaseAsset> = {}
  for (const [platform, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const url = str(entry.url)
    const sha256 = str(entry.sha256).toLowerCase()
    if (!url || !SHA256_RE.test(sha256)) continue
    assets[platform] = { url, sha256 }
  }
  return assets
}

export function normalizeAgentRelease(
  raw: StoredAgentRelease | null | undefined
): AgentReleaseView {
  if (!raw) return { ...FALLBACK }

  const assets = normalizeAssets(raw.assets)
  const tag = str(raw.tag)
  const source = str(raw.source) === 'custom-url' ? 'custom-url' : 'github'
  // 没资产等于没配置：install.sh 拿到空 assets 会去试旧路径
  if (Object.keys(assets).length === 0) {
    return { ...FALLBACK, repo: str(raw.repo), tag }
  }

  return {
    version: str(raw.version) || versionFromTag(tag),
    channel: str(raw.channel) || 'stable',
    source,
    repo: str(raw.repo),
    tag,
    assets,
    installScript: str(raw.installScript) || AGENT_INSTALL_SCRIPT,
    signature: str(raw.signature)
  }
}

async function readStored(): Promise<{
  config: AgentReleaseView
  updatedAt: string | null
}> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, AGENT_RELEASE_KEY))
    .limit(1)

  return {
    config: normalizeAgentRelease(parseJson<StoredAgentRelease>(row?.value)),
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null
  }
}

/** 公开视图：给 install.sh 与节点检查更新用，未配置也是 200 */
export async function getAgentRelease(): Promise<AgentReleaseView> {
  return (await readStored()).config
}

/** 管理端视图：多带 platforms / configured / updatedAt */
export async function getAgentReleaseAdmin(): Promise<AgentReleaseAdminView> {
  const { config, updatedAt } = await readStored()
  return {
    ...config,
    configured: config.source !== 'none',
    platforms: Object.keys(config.assets).sort(),
    updatedAt
  }
}
