import 'server-only'
import { readFile } from 'node:fs/promises'
import { asc, eq } from 'drizzle-orm'
import { ApiError } from '@/lib/api/response'
import { db } from '@/lib/db'
import { invalidateThemeCache } from './runtime'
import { plugins, settings } from '@/lib/db/schema'
import type { ThemeManifest } from './manifest'
import {
  hasThemeFiles,
  listThemeKeysOnDisk,
  readThemeMeta,
  removeThemeFiles,
  resolveThemePreviewFile,
  themeDistDir,
  themeRootDir,
  type ThemeMeta
} from './store'

/**
 * 主题对外能力：列表 / 激活态 / 卸载 / 预览图。
 *
 * 激活态存在 settings 表 key = `theme`，value = {"active":"<key>"|null}：
 * 运行时路由每次请求读它（带短缓存），所以激活后**不需要重启**。
 * 主题文件只在磁盘（${THEME_DIR}/{key}/dist），数据库只存元信息。
 */

export const THEME_SETTING_KEY = 'theme'

/** 面板自带落地页的标识，激活它表示「不启用任何主题」 */
export const DEFAULT_THEME_KEY = 'default'

export interface ThemeSetting {
  active: string | null
}

export interface ThemeListItem {
  key: string
  name: string
  version: string
  description: string
  author: string
  repoUrl: string
  commitSha: string
  gitRef: string | null
  installedAt: string
  updatedAt: string
  previousVersion: string | null
  /** dist 目录 sha256（数据库里的安装校验值） */
  checksum: string | null
  routes: ThemeManifest['routes']
  preview: string | null
  hasPreview: boolean
  /** 磁盘上 dist/ 是否还在（卷丢失时能看出来，而不是静默 404） */
  filesPresent: boolean
  active: boolean
}

export interface ThemeOverview {
  active: string | null
  themes: ThemeListItem[]
  builtin: { key: string }
  /** 主题根目录（排障用，不含敏感信息） */
  themeDir: string
}

function parseSetting(value: string | null | undefined): ThemeSetting {
  if (!value) return { active: null }
  try {
    const parsed = JSON.parse(value) as { active?: unknown }
    const active = typeof parsed.active === 'string' && parsed.active.trim() ? parsed.active.trim() : null
    return { active }
  } catch {
    return { active: null }
  }
}

/** 读激活态（运行时路由也读这里；settings 表是唯一事实来源） */
export async function getThemeSetting(): Promise<ThemeSetting> {
  const [row] = await db.select().from(settings).where(eq(settings.key, THEME_SETTING_KEY)).limit(1)
  return parseSetting(row?.value)
}

async function writeThemeSetting(active: string | null): Promise<ThemeSetting> {
  // 带 version：即使 proxy 与 API 不在同一进程（globalThis 不共享），
  // 运行时读到 version 变化也能立刻丢弃本地缓存。
  const value = JSON.stringify({ active, version: Date.now() })
  await db
    .insert(settings)
    .values({ key: THEME_SETTING_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() }
    })
  // 激活态一变就让运行时缓存立刻失效，保证「安装/激活后立即生效」
  invalidateThemeCache()
  return { active }
}

/**
 * 当前激活主题的完整 meta（含 manifest）；未激活或磁盘已丢失时返回 null。
 * 运行时路由据此决定是否把公开路径转给主题。
 */
export async function getActiveTheme(): Promise<ThemeMeta | null> {
  const { active } = await getThemeSetting()
  if (!active) return null
  if (!(await hasThemeFiles(active))) return null
  return readThemeMeta(active)
}

/** 运行时用：主题静态资源目录；未激活或文件缺失返回 null */
export async function getActiveThemeDistDir(): Promise<string | null> {
  const meta = await getActiveTheme()
  return meta ? themeDistDir(meta.key) : null
}

/** 列出已安装主题（数据库为准，磁盘状态一并返回） */
export async function listInstalledThemes(): Promise<ThemeListItem[]> {
  const [rows, setting] = await Promise.all([
    db.select().from(plugins).where(eq(plugins.type, 'theme')).orderBy(asc(plugins.installedAt)),
    getThemeSetting()
  ])

  const items: ThemeListItem[] = []
  for (const row of rows) {
    const meta = await readThemeMeta(row.key)
    const manifest = (meta?.manifest ?? parseManifest(row.manifest)) as ThemeManifest | null
    const filesPresent = await hasThemeFiles(row.key)

    items.push({
      key: row.key,
      name: meta?.name ?? row.name,
      version: meta?.version ?? row.version,
      description: manifest?.description ?? '',
      author: manifest?.author ?? '',
      repoUrl: row.repoUrl,
      commitSha: row.commitSha,
      gitRef: row.gitRef,
      installedAt: (meta?.installedAt ?? row.installedAt.toISOString()),
      updatedAt: row.updatedAt.toISOString(),
      previousVersion: row.previousVersion,
      checksum: row.checksum,
      routes: manifest?.routes ?? { include: ['/'], exclude: [] },
      preview: manifest?.preview ?? null,
      hasPreview: filesPresent && Boolean(manifest?.preview),
      filesPresent,
      active: setting.active === row.key
    })
  }

  return items
}

function parseManifest(value: string | null): ThemeManifest | null {
  if (!value) return null
  try {
    return JSON.parse(value) as ThemeManifest
  } catch {
    return null
  }
}

/** 组合视图：GET /api/v1/admin/themes */
export async function getThemeOverview(): Promise<ThemeOverview> {
  const [themes, setting] = await Promise.all([listInstalledThemes(), getThemeSetting()])
  return {
    active: setting.active,
    themes,
    builtin: { key: DEFAULT_THEME_KEY },
    themeDir: themeRootDir()
  }
}

/**
 * 激活主题；key 为 null / 'default' 表示回落到面板自带落地页。
 * 只切激活态，不动文件、不需要重启。
 */
export async function activateTheme(key: string | null): Promise<ThemeSetting> {
  if (!key || key === DEFAULT_THEME_KEY) return writeThemeSetting(null)

  const row = await db
    .select({ key: plugins.key })
    .from(plugins)
    .where(eq(plugins.key, key))
    .limit(1)

  if (!row[0]) throw new ApiError(404, 'THEME_NOT_FOUND', `主题 "${key}" 未安装`)
  if (!(await hasThemeFiles(key))) {
    throw new ApiError(
      409,
      'THEME_FILES_MISSING',
      `主题 "${key}" 的文件不在磁盘上（${themeDistDir(key)}），请重新安装后再激活`
    )
  }

  return writeThemeSetting(key)
}

/**
 * 卸载主题：若正被激活先回落 default，再删库与文件。
 * 返回被卸载的 key 与之前的激活态，便于审计。
 */
export async function deleteTheme(key: string): Promise<{ key: string; wasActive: boolean }> {
  if (key === DEFAULT_THEME_KEY) {
    throw new ApiError(422, 'THEME_DELETE_BUILTIN', '面板自带落地页不可卸载')
  }

  const [row] = await db.select({ key: plugins.key }).from(plugins).where(eq(plugins.key, key)).limit(1)
  const setting = await getThemeSetting()
  const onDisk = (await listThemeKeysOnDisk()).includes(key)

  if (!row && !onDisk) {
    throw new ApiError(404, 'THEME_NOT_FOUND', `主题 "${key}" 未安装`)
  }

  const wasActive = setting.active === key
  if (wasActive) await writeThemeSetting(null)

  if (row) await db.delete(plugins).where(eq(plugins.key, key))
  await removeThemeFiles(key)

  return { key, wasActive }
}

export interface ThemePreviewImage {
  data: Buffer
  contentType: string
  fileName: string
}

/** 截图：读 dist/<manifest.preview>（默认 preview.png），没有就 404 */
export async function getThemePreviewImage(key: string): Promise<ThemePreviewImage> {
  const meta = await readThemeMeta(key)
  const row = meta
    ? null
    : (
        await db
          .select({ manifest: plugins.manifest })
          .from(plugins)
          .where(eq(plugins.key, key))
          .limit(1)
      )[0]

  const manifest = meta?.manifest ?? parseManifest(row?.manifest ?? null)
  const previewName = manifest?.preview ?? 'preview.png'

  const resolved = await resolveThemePreviewFile(key, previewName)
  if (!resolved) {
    throw new ApiError(
      404,
      'THEME_PREVIEW_NOT_FOUND',
      `主题 "${key}" 没有截图（期望 ${previewName}，未找到或格式不支持 PNG/JPEG/WebP/GIF）`
    )
  }

  const data = await readFile(resolved.file)
  return { data, contentType: resolved.contentType, fileName: previewName }
}

// 存储与安装流水线的对外出口（其它任务/服务只从这里引）
export { installThemeFromRepo, previewThemeFromRepo, parseThemeRepoUrl } from './install'
export type { InstallThemeResult, PreviewThemeResult, InstallThemeInput } from './install'
export { discoverThemes } from './discover'
export type { DiscoveredTheme, ThemeDiscoverResult } from './discover'
export {
  THEME_BASE_PATH,
  THEME_KEY_PATTERN,
  validateThemeManifest
} from './manifest'
export type { ThemeManifest } from './manifest'
export { themeRootDir, themeDistDir, themeDir, cleanupDir } from './store'
export type { ThemeMeta } from './store'
