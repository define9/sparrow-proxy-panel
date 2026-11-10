import { z } from 'zod'
import { ApiError } from '@/lib/api/response'

/**
 * 主题 manifest（sparrow-theme.json）的 schema 与安全红线校验。
 *
 * 主题是一套**完整的独立静态站点**：仓库里提交构建产物（output 目录），
 * 面板只做静态托管，不执行任何主题代码，也不在服务器上跑 npm install / build。
 *
 * 存储契约见 lib/themes/store.ts（${THEME_DIR}/{key}/meta.json + dist/），
 * 插件体系背景见 docs/architecture/plugin-system.md §6。
 */

/** manifest 文件名，固定在仓库根 */
export const THEME_MANIFEST_FILE = 'sparrow-theme.json'

/** 唯一的静态资源挂载点：主题构建时 base 必须写成它 */
export const THEME_BASE_PATH = '/theme-assets'

/** 主题 key：小写字母数字 + 连字符，全局唯一 */
export const THEME_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** `default` 是面板自带落地页，不允许被主题占用 */
export const RESERVED_THEME_KEYS = ['default'] as const

/** 面板版本（兼容区间判定用）；容器里可用 PANEL_VERSION 覆盖 */
export const PANEL_VERSION = process.env.PANEL_VERSION?.trim() || '0.1.0'

/**
 * 面板自有路径：主题**绝不能**接管。
 * 命中即拒绝安装——后台与登录页依赖面板自己的会话与 RBAC。
 */
export const PROTECTED_PATH_PREFIXES = [
  '/admin',
  '/dashboard',
  '/api',
  '/sub',
  '/setup',
  '/login',
  '/theme-assets'
] as const

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const manifestObjectSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'key 不能为空')
    .max(64, 'key 最长 64 个字符')
    .regex(THEME_KEY_PATTERN, 'key 只能是小写字母、数字与连字符（例如 neon-nights）'),
  name: z.string().trim().min(1, 'name 不能为空').max(64, 'name 最长 64 个字符'),
  version: z.string().trim().regex(SEMVER, 'version 必须是 x.y.z 形式的语义化版本'),
  author: z.string().trim().max(64).optional().default(''),
  description: z.string().trim().max(500).optional().default(''),
  panel: z.string().trim().min(1, 'panel 不能为空（例如 ">=0.1.0 <1.0.0"）').max(64),
  basePath: z.string().trim().min(1, 'basePath 不能为空'),
  output: z.string().trim().min(1, 'output 不能为空').max(200).optional().default('dist'),
  routes: z
    .object({
      include: z.array(z.string()).optional().default(['/']),
      exclude: z.array(z.string()).optional().default([])
    })
    .optional()
    .default({ include: ['/'], exclude: [] }),
  /** 截图文件名（相对 output 目录），管理端列表展示用 */
  preview: z.string().trim().max(200).optional()
})

export type ThemeManifest = z.infer<typeof manifestObjectSchema>
export type ThemeRoutes = ThemeManifest['routes']

/** 相对目录是否安全：禁止绝对路径、`..`、盘符与反斜杠 */
export function isSafeRelativeDir(value: string): boolean {
  const dir = value.trim()
  if (!dir) return false
  if (dir.startsWith('/') || dir.startsWith('~')) return false
  if (/^[A-Za-z]:/.test(dir)) return false
  if (dir.includes('\\') || dir.includes('\0')) return false
  const segments = dir.split('/')
  return segments.every((segment) => segment !== '..')
}

function normalizeRoutePath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '/') return '/'
  return trimmed.replace(/\/+$/, '')
}

/** 是否落在面板自有路径上（大小写不敏感，含子路径） */
export function isProtectedRoutePath(routePath: string): boolean {
  const path = normalizeRoutePath(routePath).toLowerCase()
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}

/* --------------------------- 兼容区间（极简 semver） --------------------------- */

interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value.trim())
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function compareVersion(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

/**
 * 只支持 manifest 里实际会用到的写法：空格分隔的比较子句，
 * 支持 `>=` `>` `<=` `<` `=` `^` `~`。解析不了就返回 null（视为 manifest 不合法）。
 */
export function satisfiesPanelRange(version: string, range: string): boolean | null {
  const current = parseVersion(version)
  if (!current) return null

  const clauses = range.trim().split(/\s+/).filter(Boolean)
  if (clauses.length === 0) return null

  for (const clause of clauses) {
    const match = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(clause)
    if (!match) return null

    const operator = match[1] ?? '='
    const target = parseVersion(match[2] ?? '')
    if (!target) return null

    const comparison = compareVersion(current, target)

    switch (operator) {
      case '>=':
        if (comparison < 0) return false
        break
      case '>':
        if (comparison <= 0) return false
        break
      case '<=':
        if (comparison > 0) return false
        break
      case '<':
        if (comparison >= 0) return false
        break
      case '^':
        // ^0.1.2 → >=0.1.2 <0.2.0；^1.2.3 → >=1.2.3 <2.0.0
        if (comparison < 0) return false
        if (target.major > 0) {
          if (current.major !== target.major) return false
        } else if (current.minor !== target.minor) {
          return false
        }
        break
      case '~':
        if (comparison < 0) return false
        if (current.major !== target.major || current.minor !== target.minor) return false
        break
      default:
        if (comparison !== 0) return false
    }
  }

  return true
}

/* -------------------------------- 校验入口 -------------------------------- */

export interface ValidateThemeManifestOptions {
  /** 面板版本，默认 PANEL_VERSION */
  panelVersion?: string
  /** 已安装的主题 key（用于提示重复，不做拒绝——同 key 视为升级） */
  installedKeys?: readonly string[]
}

/**
 * 校验 manifest。任何不满足红线的情况都抛 ApiError(422)，
 * message 必须能直接展示给管理员，说明「为什么不允许」。
 */
export function validateThemeManifest(
  raw: unknown,
  options: ValidateThemeManifestOptions = {}
): ThemeManifest {
  const parsed = manifestObjectSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path?.join('.') ?? ''
    throw new ApiError(
      422,
      'THEME_MANIFEST_INVALID',
      `sparrow-theme.json 不合法：${path ? `${path} ` : ''}${first?.message ?? '未知字段错误'}`,
      { path }
    )
  }

  const manifest = parsed.data

  // 1. key 不能占用面板保留标识
  if ((RESERVED_THEME_KEYS as readonly string[]).includes(manifest.key)) {
    throw new ApiError(
      422,
      'THEME_KEY_RESERVED',
      `主题 key "${manifest.key}" 是面板保留标识（面板自带落地页），请换一个 key`
    )
  }

  // 2. basePath 固定：我们只支持 /theme-assets 这一种接入方式
  if (manifest.basePath !== THEME_BASE_PATH) {
    throw new ApiError(
      422,
      'THEME_BASE_PATH_INVALID',
      `basePath 必须是 "${THEME_BASE_PATH}"，当前为 "${manifest.basePath}"：面板只从 ${THEME_BASE_PATH}/ 托管主题静态资源`
    )
  }

  // 3. output 只能是仓库内的相对目录
  if (!isSafeRelativeDir(manifest.output)) {
    throw new ApiError(
      422,
      'THEME_OUTPUT_INVALID',
      `output 必须是仓库内的相对目录（不能是绝对路径，也不能包含 ".."），当前为 "${manifest.output}"`
    )
  }

  // 4. routes.include 不能碰面板自有路径
  if (manifest.routes.include.length === 0) {
    throw new ApiError(422, 'THEME_ROUTES_INVALID', 'routes.include 至少要有 1 个路径')
  }

  const include = manifest.routes.include.map(normalizeRoutePath)

  for (const routePath of include) {
    if (!routePath.startsWith('/')) {
      throw new ApiError(
        422,
        'THEME_ROUTES_INVALID',
        `routes.include 里的路径必须以 "/" 开头（当前为 "${routePath}"）`
      )
    }
    if (routePath.includes('*')) {
      throw new ApiError(
        422,
        'THEME_ROUTES_INVALID',
        `routes.include 只支持路径前缀，不支持通配符（当前为 "${routePath}"）`
      )
    }
    if (isProtectedRoutePath(routePath)) {
      throw new ApiError(
        422,
        'THEME_ROUTES_PROTECTED',
        `routes.include 不允许包含 "${routePath}"：/admin、/dashboard、/api、/sub、/setup、/login、/theme-assets 是面板自有路径，主题不能接管（后台与登录依赖面板自己的会话逻辑）`
      )
    }
  }

  const exclude = manifest.routes.exclude.map(normalizeRoutePath)
  for (const routePath of exclude) {
    if (!routePath.startsWith('/')) {
      throw new ApiError(
        422,
        'THEME_ROUTES_INVALID',
        `routes.exclude 里的路径必须以 "/" 开头（当前为 "${routePath}"）`
      )
    }
  }

  // 5. preview 只能是 output 内的相对文件名
  if (manifest.preview !== undefined && !isSafeRelativeDir(manifest.preview)) {
    throw new ApiError(
      422,
      'THEME_PREVIEW_INVALID',
      `preview 必须是 output 目录内的相对文件名（不能越级），当前为 "${manifest.preview}"`
    )
  }

  // 6. 面板版本兼容区间
  const satisfied = satisfiesPanelRange(options.panelVersion ?? PANEL_VERSION, manifest.panel)
  if (satisfied === null) {
    throw new ApiError(
      422,
      'THEME_PANEL_RANGE_INVALID',
      `panel 兼容区间无法解析："${manifest.panel}"，示例写法 ">=0.1.0 <1.0.0"`
    )
  }
  if (!satisfied) {
    throw new ApiError(
      422,
      'THEME_PANEL_INCOMPATIBLE',
      `主题要求面板版本 ${manifest.panel}，当前面板为 ${options.panelVersion ?? PANEL_VERSION}，已拒绝安装`,
      { required: manifest.panel, current: options.panelVersion ?? PANEL_VERSION }
    )
  }

  return {
    ...manifest,
    routes: { include: [...new Set(include)], exclude: [...new Set(exclude)] }
  }
}

/** 只读解析（用于 preview 展示，不做红线校验之外的副作用） */
export function parseThemeManifestJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ApiError(422, 'THEME_MANIFEST_INVALID', 'sparrow-theme.json 不是合法的 JSON')
  }
}
