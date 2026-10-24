import { PLUGIN_HOOKS, PluginManifestSchema } from '@sparrow/contracts'
import type { PluginManifest } from '@sparrow/contracts'

/**
 * 插件清单（manifest）校验。
 *
 * 契约定义在 packages/contracts/src/domain/plugin.ts，这里只做「契约之外的补充校验」：
 * - configSchema 必须是 JSON Schema（object + properties）
 * - hooks 必须是契约里登记的扩展点
 */

/** 单条校验问题 */
export interface PluginManifestIssue {
  /** 出错字段路径，如 'configSchema.properties.pid' */
  path: string
  message: string
}

/** 清单非法时抛出 */
export class PluginManifestError extends Error {
  readonly issues: PluginManifestIssue[]

  constructor(issues: PluginManifestIssue[]) {
    super(`插件清单校验失败：${issues.map(issue => `${issue.path} ${issue.message}`).join('；')}`)
    this.name = 'PluginManifestError'
    this.issues = issues
  }
}

export type PluginManifestParseResult
  = | { success: true, manifest: PluginManifest }
    | { success: false, issues: PluginManifestIssue[] }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** configSchema 必须是 JSON Schema（draft-07 子集） */
function checkConfigSchema(configSchema: unknown): PluginManifestIssue[] {
  if (!isPlainObject(configSchema)) {
    return [{ path: 'configSchema', message: '必须是 JSON Schema 对象' }]
  }

  const issues: PluginManifestIssue[] = []

  if (configSchema.type !== undefined && configSchema.type !== 'object') {
    issues.push({ path: 'configSchema.type', message: '只支持 type=object' })
  }
  if (configSchema.properties !== undefined && !isPlainObject(configSchema.properties)) {
    issues.push({ path: 'configSchema.properties', message: '必须是对象' })
  }
  if (configSchema.required !== undefined) {
    const required = configSchema.required
    if (!Array.isArray(required) || required.some(item => typeof item !== 'string')) {
      issues.push({ path: 'configSchema.required', message: '必须是字符串数组' })
    }
  }

  return issues
}

/** 解析并校验清单，不抛异常 */
export function parsePluginManifest(input: unknown): PluginManifestParseResult {
  const result = PluginManifestSchema.safeParse(input)

  if (!result.success) {
    const issues = result.error.issues.map(issue => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message
    }))
    return { success: false, issues }
  }

  const manifest = result.data
  const issues = checkConfigSchema(manifest.configSchema)

  if (issues.length > 0) {
    return { success: false, issues }
  }

  return { success: true, manifest }
}

/** 校验清单，非法时抛 PluginManifestError */
export function validatePluginManifest(input: unknown): PluginManifest {
  const result = parsePluginManifest(input)

  if (!result.success) {
    throw new PluginManifestError(result.issues)
  }

  return result.manifest
}

/** 契约登记的全部扩展点 */
export const pluginHooks = PLUGIN_HOOKS

/** 判断 hook 是否为契约登记的扩展点 */
export function isPluginHook(hook: string): hook is (typeof PLUGIN_HOOKS)[number] {
  return (PLUGIN_HOOKS as readonly string[]).includes(hook)
}
