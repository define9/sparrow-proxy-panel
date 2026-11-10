import 'server-only'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'

/**
 * 主题运行时：读激活态（settings.key = 'theme'）+ 读磁盘 meta.json + 托管 dist/ 静态文件。
 *
 * 存储契约（与主题安装/激活任务一致）：
 *   ${THEME_DIR:-<cwd>/data/themes}/{key}/meta.json
 *   ${THEME_DIR:-<cwd>/data/themes}/{key}/dist/index.html
 *
 * 只在 proxy（Node.js runtime）里使用，不做任何业务写入。
 */

export const THEME_SETTINGS_KEY = 'theme'
export const THEME_ASSETS_PREFIX = '/theme-assets'

/** 激活态缓存 5 秒：避免每个公开请求都查库 */
const ACTIVE_TTL_MS = 5_000
/** manifest 缓存 10 秒：安装/卸载后由 invalidateThemeCache() 主动失效 */
const MANIFEST_TTL_MS = 10_000

export interface ThemeRoutes {
  include?: string[]
  exclude?: string[]
}

export interface ThemeManifest {
  key: string
  name: string
  version?: string
  basePath?: string
  output?: string
  routes?: ThemeRoutes
}

export interface ThemeMeta {
  key: string
  name: string
  version: string
  repoUrl?: string
  commitSha?: string
  installedAt?: string
  manifest?: ThemeManifest
}

export interface ActiveTheme {
  key: string
  meta: ThemeMeta
  /** {THEME_DIR}/{key}/dist 的绝对路径 */
  distDir: string
}

type ActiveCache = { key: string | null; at: number } | null
type ManifestCacheEntry = { meta: ThemeMeta | null; at: number }

let activeCache: ActiveCache = null
const manifestCache = new Map<string, ManifestCacheEntry>()

/** 主题根目录；THEME_DIR 优先，否则 <cwd>/data/themes */
export function themesRootDir(): string {
  const configured = process.env.THEME_DIR?.trim()
  return configured ? path.resolve(configured) : path.join(process.cwd(), 'data', 'themes')
}

/** 激活/卸载/更新主题后调用，让进程内缓存立刻失效 */
export function invalidateThemeCache(): void {
  activeCache = null
  manifestCache.clear()
}

/** 只接受安全的主题 key，避免通过 settings 值做路径穿越 */
function isSafeThemeKey(key: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key) && !key.includes('..')
}

async function readActiveKey(): Promise<string | null> {
  const now = Date.now()
  if (activeCache && now - activeCache.at < ACTIVE_TTL_MS) return activeCache.key

  try {
    const rows = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, THEME_SETTINGS_KEY))
      .limit(1)

    const raw = rows[0]?.value
    let key: string | null = null
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && 'active' in parsed) {
        const active = (parsed as { active?: unknown }).active
        if (typeof active === 'string' && isSafeThemeKey(active)) key = active
      }
    }

    activeCache = { key, at: now }
    return key
  } catch (error) {
    // 数据库暂时不可用：不缓存失败结果，下一个请求重试；本次按「无激活主题」处理
    console.warn('[theme] 读取激活态失败，本次回退面板', error)
    return null
  }
}

async function readMetaFile(key: string): Promise<ThemeMeta | null> {
  const file = path.join(themesRootDir(), key, 'meta.json')
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') throw new Error('meta.json 不是对象')
    const meta = parsed as Partial<ThemeMeta>
    if (typeof meta.key !== 'string' || typeof meta.name !== 'string') {
      throw new Error('meta.json 缺少 key/name')
    }
    return meta as ThemeMeta
  } catch (error) {
    console.warn(`[theme] 读取 ${file} 失败`, error)
    return null
  }
}

/** 读 manifest（来自 {key}/meta.json），10 秒进程内缓存 */
export async function getThemeManifest(key: string): Promise<ThemeMeta | null> {
  if (!isSafeThemeKey(key)) return null
  const now = Date.now()
  const hit = manifestCache.get(key)
  if (hit && now - hit.at < MANIFEST_TTL_MS) return hit.meta

  const meta = await readMetaFile(key)
  manifestCache.set(key, { meta, at: now })
  return meta
}

/** 当前激活主题（含 dist 目录）；未激活或 meta 不可读时为 null */
export async function getActiveTheme(): Promise<ActiveTheme | null> {
  const key = await readActiveKey()
  if (!key) return null
  const meta = await getThemeManifest(key)
  if (!meta) return null
  return { key, meta, distDir: path.join(themesRootDir(), key, 'dist') }
}

/** 路径前缀匹配（/ 匹配所有） */
function matchesPrefix(pathname: string, prefix: string): boolean {
  if (prefix === '/' || prefix === '') return true
  const normalized = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  return pathname === normalized || pathname.startsWith(`${normalized}/`)
}

/** 主题 manifest.routes.include 命中且未被 exclude 排除 */
export function matchesThemeRoutes(pathname: string, meta: ThemeMeta): boolean {
  const routes = meta.manifest?.routes
  const include = routes?.include?.length ? routes.include : ['/']
  const exclude = routes?.exclude ?? []
  if (exclude.some((prefix) => matchesPrefix(pathname, prefix))) return false
  return include.some((prefix) => matchesPrefix(pathname, prefix))
}

/**
 * 把 URL 路径解析到 dist/ 内的真实文件，越界（路径穿越）返回 null。
 * relativePath 必须以 / 开头。
 */
function resolveInsideDist(distDir: string, relativePath: string): string | null {
  const decoded = decodeURIComponent(relativePath)
  if (decoded.includes('\0')) return null
  const resolved = path.resolve(distDir, `.${path.posix.normalize(decoded)}`)
  const root = path.resolve(distDir)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
}

function contentTypeFor(file: string): string | null {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? null
}

/** 带 hash 的资源长缓存，其余（尤其 index.html）不缓存 */
function cacheControlFor(relativePath: string): string {
  const hashed = /(?:^|\/)assets\//.test(relativePath) || /\.[a-f0-9]{8,}\.[a-z0-9]+$/i.test(relativePath)
  return hashed ? 'public, max-age=31536000, immutable' : 'no-store, must-revalidate'
}

async function readFileIfExists(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file)
  } catch {
    return null
  }
}

function htmlResponse(body: Buffer, themeKey: string, method: string): Response {
  return new Response(method === 'HEAD' ? null : new Uint8Array(body), {
    status: 200,
    headers: {
      'content-type': CONTENT_TYPES['.html'],
      'cache-control': 'no-store, must-revalidate',
      'x-theme': themeKey
    }
  })
}

const URL_EXT = /\.[A-Za-z0-9]+$/

/**
 * 返回主题 dist/index.html（SPA 兜底）。
 * 缺失时返回 null，调用方回退面板落地页。
 */
async function serveIndex(distDir: string, themeKey: string, method: string): Promise<Response | null> {
  const indexFile = path.join(distDir, 'index.html')
  const body = await readFileIfExists(indexFile)
  if (!body) {
    console.warn(`[theme] ${indexFile} 不存在，回退面板落地页`)
    return null
  }
  return htmlResponse(body, themeKey, method)
}

/** 公开页面：/ → index.html；/pricing → pricing.html → index.html（SPA 语义） */
async function servePage(theme: ActiveTheme, pathname: string, method: string): Promise<Response | null> {
  const hasExtension = URL_EXT.test(pathname)
  const extension = path.extname(pathname).toLowerCase()

  if (hasExtension && extension !== '.html') {
    // 带扩展名的非 HTML 请求：只做精确文件命中，命不中就交还面板（public/ 资源等）
    const file = resolveInsideDist(theme.distDir, pathname)
    if (!file) return null
    const type = contentTypeFor(file)
    if (!type) return null
    const body = await readFileIfExists(file)
    if (!body) return null
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': cacheControlFor(pathname),
        'x-theme': theme.key
      }
    })
  }

  const candidates: string[] = []
  const base = resolveInsideDist(theme.distDir, pathname)
  if (base) {
    if (extension === '.html') {
      candidates.push(base)
    } else {
      if (pathname !== '/') candidates.push(`${base}.html`)
      candidates.push(path.join(base, 'index.html'))
    }
  }

  for (const candidate of candidates) {
    const body = await readFileIfExists(candidate)
    if (body) return htmlResponse(body, theme.key, method)
  }

  // 找不到对应页面就回退 index.html（SPA 语义）
  return serveIndex(theme.distDir, theme.key, method)
}

/** /theme-assets/** → {theme}/dist/**（白名单扩展名 + 路径穿越防护） */
async function serveAsset(theme: ActiveTheme, pathname: string, method: string): Promise<Response | null> {
  const relative = pathname.slice(THEME_ASSETS_PREFIX.length) || '/'
  let file: string | null
  try {
    file = resolveInsideDist(theme.distDir, relative.startsWith('/') ? relative : `/${relative}`)
  } catch {
    return null
  }
  if (!file) return null

  const type = contentTypeFor(file)
  if (!type) {
    console.warn(`[theme] 拒绝未在白名单内的资源: ${pathname}`)
    return null
  }

  const body = await readFileIfExists(file)
  if (!body) {
    console.warn(`[theme] 资源不存在: ${pathname}`)
    return null
  }

  return new Response(method === 'HEAD' ? null : new Uint8Array(body), {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': cacheControlFor(relative),
      'x-theme': theme.key
    }
  })
}

/**
 * proxy 的统一入口：命中主题返回 Response，否则 null（原样交给面板）。
 * 任何读取异常都回退面板，绝不 500。
 */
export async function handleThemeRequest(pathname: string, method: string): Promise<Response | null> {
  try {
    if (pathname === THEME_ASSETS_PREFIX) return null
    const isAsset = pathname.startsWith(`${THEME_ASSETS_PREFIX}/`)

    if (!isAsset && method !== 'GET' && method !== 'HEAD') return null

    const theme = await getActiveTheme()
    if (!theme) return null

    if (isAsset) return await serveAsset(theme, pathname, method)

    if (!matchesThemeRoutes(pathname, theme.meta)) return null

    return await servePage(theme, pathname, method)
  } catch (error) {
    console.warn('[theme] 处理主题请求失败，回退面板', error)
    return null
  }
}
