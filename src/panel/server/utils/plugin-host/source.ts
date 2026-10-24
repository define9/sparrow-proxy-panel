import { createHash } from 'node:crypto'
import { parsePluginManifest } from './manifest'
import type { PluginManifest } from '@sparrow/contracts'

/**
 * 三方源（url 类型）索引解析与校验。
 *
 * 同步流程（docs/architecture/plugin-system.md）：
 *   拉取索引 → 校验每项 checksum → 与本地已安装版本比对
 *
 * TODO: git / marketplace 类型三方源尚未实现，接口保留 type 字段。
 */

/** 索引单项 */
export interface SourceIndexEntry {
  key: string
  name: string
  version: string
  /** 期望的 sha256（sha256:xxx） */
  checksum: string | null
  /** 实际计算出的 sha256 */
  computedChecksum: string
  manifest: PluginManifest
  /** 插件包下载地址（可选） */
  url: string | null
}

/** 索引解析问题 */
export interface SourceIndexIssue {
  /** 插件 key（无法识别时为 null） */
  key: string | null
  message: string
}

export interface SourceIndexResult {
  entries: SourceIndexEntry[]
  issues: SourceIndexIssue[]
  /** 索引原文的 sha256 */
  checksum: string
}

/** 稳定序列化（键排序），用于计算 checksum */
export function pluginCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null)
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => pluginCanonicalJson(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${pluginCanonicalJson(item)}`).join(',')}}`
}

/** 计算 sha256（带 sha256: 前缀） */
export function pluginSha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 取出索引里的条目数组（兼容 { plugins: [] } / { items: [] } / 裸数组） */
function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }
  if (isPlainObject(payload)) {
    for (const key of ['plugins', 'items', 'entries', 'data']) {
      const value = payload[key]
      if (Array.isArray(value)) {
        return value
      }
    }
  }
  return []
}

/**
 * 校验 manifest 的 checksum。
 *
 * 约定：checksum 是 manifest 内容的 sha256（可带 `sha256:` 前缀）。
 * 为了兼容不同发布工具的序列化方式，规范化 JSON 与原始 JSON 两种都接受。
 */
export function verifyManifestChecksum(manifest: PluginManifest, declared: string): boolean {
  const expected = declared.replace(/^sha256:/i, '').toLowerCase()
  const candidates = [
    pluginSha256(pluginCanonicalJson(manifest)),
    pluginSha256(JSON.stringify(manifest))
  ].map(value => value.replace('sha256:', '').toLowerCase())

  return candidates.includes(expected)
}

/**
 * 解析并校验索引。
 *
 * 每项：{ manifest: {...}, checksum, url? }。
 * checksum 必填：无法校验的条目一律跳过（安装第三方插件必须先过 checksum）。
 */
export function parseSourceIndex(body: string): SourceIndexResult {
  const checksum = pluginSha256(body)
  const issues: SourceIndexIssue[] = []
  const entries: SourceIndexEntry[] = []

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return { entries, issues: [{ key: null, message: '索引不是合法 JSON' }], checksum }
  }

  const items = extractItems(payload)
  if (items.length === 0) {
    issues.push({ key: null, message: '索引为空' })
  }

  for (const item of items) {
    const wrapper = isPlainObject(item) && isPlainObject(item.manifest)
      ? item
      : { manifest: item }
    const rawManifest = wrapper.manifest
    const parsed = parsePluginManifest(rawManifest)

    if (!parsed.success) {
      issues.push({
        key: typeof (rawManifest as Record<string, unknown>)?.key === 'string'
          ? (rawManifest as Record<string, unknown>).key as string
          : null,
        message: `清单校验失败：${parsed.issues.map(issue => `${issue.path} ${issue.message}`).join('；')}`
      })
      continue
    }

    const manifest = parsed.manifest
    const computedChecksum = pluginSha256(pluginCanonicalJson(manifest))
    const declaredChecksum = typeof wrapper.checksum === 'string' ? wrapper.checksum : null

    if (!declaredChecksum) {
      issues.push({ key: manifest.key, message: '缺少 checksum，无法校验' })
      continue
    }

    if (!verifyManifestChecksum(manifest, declaredChecksum)) {
      issues.push({
        key: manifest.key,
        message: `checksum 校验失败：期望 ${declaredChecksum}，实际 ${computedChecksum}`
      })
      continue
    }

    entries.push({
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      checksum: declaredChecksum,
      computedChecksum,
      manifest,
      url: typeof wrapper.url === 'string' ? wrapper.url : (manifest.entry ?? null)
    })
  }

  return { entries, issues, checksum }
}

/** 语义化版本比较：a > b 返回正数 */
export function pluginCompareVersions(a: string, b: string): number {
  const parse = (value: string) => value
    .replace(/^v/i, '')
    .split('-')[0]
    ?.split('.')
    .map(part => Number.parseInt(part, 10) || 0) ?? []

  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)

  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }

  return 0
}

/** 与已安装插件的比对结果 */
export interface SourceComparison {
  key: string
  name: string
  version: string
  /** new=未安装 / installed=已是该版本 / update=有更新版本 */
  state: 'new' | 'installed' | 'update'
  /** 已安装版本 */
  installedVersion: string | null
}

/** 索引与本地已安装插件比对 */
export function pluginCompareWithInstalled(
  entries: SourceIndexEntry[],
  installed: Array<{ key: string, version: string }>
): SourceComparison[] {
  return entries.map((entry) => {
    const local = installed.find(item => item.key === entry.key)

    if (!local) {
      return { key: entry.key, name: entry.name, version: entry.version, state: 'new', installedVersion: null }
    }

    const diff = pluginCompareVersions(entry.version, local.version)
    return {
      key: entry.key,
      name: entry.name,
      version: entry.version,
      state: diff > 0 ? 'update' : 'installed',
      installedVersion: local.version
    }
  })
}
