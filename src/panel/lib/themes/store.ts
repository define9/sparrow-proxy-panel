import 'server-only'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ApiError } from '@/lib/api/response'
import {
  THEME_KEY_PATTERN,
  THEME_MANIFEST_FILE,
  type ThemeManifest
} from './manifest'

/**
 * 主题落盘存储。
 *
 * 目录契约（与运行时路由任务共享，改动前先对齐）：
 *
 *   ${THEME_DIR:-<cwd>/data/themes}/{key}/
 *     meta.json   # { key, name, version, repoUrl, commitSha, installedAt, manifest }
 *     dist/       # 已构建好的静态站点（index.html / assets / 其他 .html）
 *
 * 主题文件只存磁盘，数据库只存元信息。
 */

export const THEME_META_FILE = 'meta.json'
export const THEME_DIST_DIR = 'dist'
export const THEME_BACKUP_SUFFIX = '.bak'

export interface ThemeMeta {
  key: string
  name: string
  version: string
  repoUrl: string
  commitSha: string
  /** ISO 时间字符串，方便 meta.json 直接展示与跨进程读取 */
  installedAt: string
  manifest: ThemeManifest
}

/** 主题根目录：THEME_DIR 优先，默认 <cwd>/data/themes（容器里 cwd=/app） */
export function themeRootDir(): string {
  const configured = process.env.THEME_DIR?.trim()
  return configured ? path.resolve(configured) : path.join(process.cwd(), 'data', 'themes')
}

/** 安装用的临时目录：<cwd>/data/tmp（与主题目录同盘，rename 通常不需要跨设备拷贝） */
export function themeTmpDir(): string {
  const configured = process.env.THEME_TMP_DIR?.trim()
  return configured ? path.resolve(configured) : path.join(process.cwd(), 'data', 'tmp')
}

/** key 来自 manifest 校验，这里再兜一次底，杜绝路径穿越 */
export function assertThemeKey(key: string): string {
  if (!THEME_KEY_PATTERN.test(key)) {
    throw new ApiError(400, 'THEME_KEY_INVALID', `主题 key 不合法："${key}"`)
  }
  return key
}

export function themeDir(key: string): string {
  return path.join(themeRootDir(), assertThemeKey(key))
}

export function themeDistDir(key: string): string {
  return path.join(themeDir(key), THEME_DIST_DIR)
}

export function themeBackupDir(key: string): string {
  return `${themeDir(key)}${THEME_BACKUP_SUFFIX}`
}

export function themeMetaPath(key: string): string {
  return path.join(themeDir(key), THEME_META_FILE)
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

export async function createThemeTempDir(prefix = 'theme'): Promise<string> {
  const root = themeTmpDir()
  await mkdir(root, { recursive: true })
  return mkdtemp(path.join(root, `${prefix}-`))
}

/** 读 {key}/meta.json；目录或文件不存在返回 null（不抛错） */
export async function readThemeMeta(key: string): Promise<ThemeMeta | null> {
  const file = themeMetaPath(key)
  try {
    const text = await readFile(file, 'utf8')
    return JSON.parse(text) as ThemeMeta
  } catch {
    return null
  }
}

export async function hasThemeFiles(key: string): Promise<boolean> {
  return pathExists(themeDistDir(key))
}

/** 列出磁盘上所有主题 key（只认 meta.json 齐全的目录，跳过 .bak 与临时目录） */
export async function listThemeKeysOnDisk(): Promise<string[]> {
  const root = themeRootDir()
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }

  const keys: string[] = []
  for (const entry of entries) {
    if (!THEME_KEY_PATTERN.test(entry)) continue
    if (await pathExists(path.join(root, entry, THEME_META_FILE))) keys.push(entry)
  }
  return keys.sort()
}

/**
 * 目录内容哈希：排序后把「相对路径 + 文件内容」喂给 sha256。
 * 用于管理端展示与回滚校验，不随文件系统遍历顺序变化。
 */
export async function hashDirectory(dir: string): Promise<string> {
  const hash = createHash('sha256')

  async function walk(current: string, prefix: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(full, rel)
        continue
      }
      hash.update(`file:${rel}\n`)
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(full)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('error', reject)
        stream.on('end', () => resolve())
      })
    }
  }

  await walk(dir, '')
  return hash.digest('hex')
}

export interface StageThemeInput {
  key: string
  /** 已经准备好的 dist 目录（位于临时目录内） */
  sourceDistDir: string
  manifest: ThemeManifest
  repoUrl: string
  commitSha: string
  installedAt?: Date
}

export interface StageThemeResult {
  distSha256: string
  /** 同 key 升级时的旧版本号（首次安装为 null） */
  previousVersion: string | null
  /** 旧版本备份目录（{key}.bak），首次安装为 null */
  backupDir: string | null
}

/**
 * 把构建产物落到 ${THEME_DIR}/{key}/dist 并写 meta.json。
 *
 * 先在同盘临时目录算好哈希，再一次性换目录：
 * 1. 已有同 key → 旧目录改名为 {key}.bak（保留一份可回滚）
 * 2. 新目录 rename 就位（跨设备时退化为复制）
 * 任何一步失败都不会破坏已安装的旧版本。
 */
export async function stageTheme(input: StageThemeInput): Promise<StageThemeResult> {
  const key = assertThemeKey(input.key)
  const distSha256 = await hashDirectory(input.sourceDistDir)

  const root = themeRootDir()
  await mkdir(root, { recursive: true })

  const target = themeDir(key)
  const backup = themeBackupDir(key)

  const previous = await readThemeMeta(key)
  const previousVersion = previous?.version ?? null

  let backupDir: string | null = null
  await rm(backup, { recursive: true, force: true })
  if (await pathExists(target)) {
    await rename(target, backup)
    backupDir = backup
  }

  const staging = await createThemeTempDir(`stage-${key}`)
  try {
    const stagedDist = path.join(staging, THEME_DIST_DIR)
    await cp(input.sourceDistDir, stagedDist, { recursive: true, dereference: true })

    try {
      await rename(staging, target)
    } catch (error) {
      // EXDEV（THEME_DIR 与 cwd 不在同一设备）时退化为复制
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
      await cp(staging, target, { recursive: true, dereference: true })
      await rm(staging, { recursive: true, force: true })
    }

    const meta: ThemeMeta = {
      key,
      name: input.manifest.name,
      version: input.manifest.version,
      repoUrl: input.repoUrl,
      commitSha: input.commitSha,
      installedAt: (input.installedAt ?? new Date()).toISOString(),
      manifest: input.manifest
    }
    await writeFile(themeMetaPath(key), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')

    return { distSha256, previousVersion, backupDir }
  } catch (error) {
    // 换目录失败：把备份还原回去，避免「装新版本把旧版本弄丢」
    if (backupDir && !(await pathExists(target))) {
      await rename(backup, target).catch(() => undefined)
    }
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

/** 卸载：连同 {key}.bak 一起删掉 */
export async function removeThemeFiles(key: string): Promise<void> {
  await rm(themeDir(key), { recursive: true, force: true })
  await rm(themeBackupDir(key), { recursive: true, force: true })
}

/** 清理临时目录，失败只记日志（不能影响主流程的报错） */
export async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch((error: unknown) => {
    console.warn(`[themes] 清理临时目录失败 ${dir}`, error)
  })
}

/**
 * 解析主题截图文件：只允许 output 目录内的相对文件名，
 * 并限制为常见位图后缀（不允许 svg，避免同源脚本注入）。
 */
export const PREVIEW_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export async function resolveThemePreviewFile(
  key: string,
  previewName = 'preview.png'
): Promise<{ file: string; contentType: string } | null> {
  const dist = themeDistDir(key)
  const normalized = path.normalize(previewName).replace(/^([./\\])+/, '')
  const file = path.resolve(dist, normalized)

  if (file !== dist && !file.startsWith(`${dist}${path.sep}`)) return null

  const contentType = PREVIEW_CONTENT_TYPES[path.extname(file).toLowerCase()]
  if (!contentType) return null
  if (!(await pathExists(file))) return null

  return { file, contentType }
}

export async function readThemeManifestFile(repoDir: string): Promise<string> {
  const file = path.join(repoDir, THEME_MANIFEST_FILE)
  try {
    return await readFile(file, 'utf8')
  } catch {
    throw new ApiError(
      422,
      'THEME_MANIFEST_MISSING',
      `仓库根目录缺少 ${THEME_MANIFEST_FILE}，无法识别为主题（参考模板：sparrow-theme.json）`
    )
  }
}
