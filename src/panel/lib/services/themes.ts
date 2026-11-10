import 'server-only'
import type { AuditContext } from '@/lib/api/audit'
import { writeAudit } from '@/lib/api/audit'
import {
  activateTheme as activateThemeState,
  deleteTheme as deleteThemeState,
  discoverThemes as discoverThemesImpl,
  getThemeOverview,
  getThemePreviewImage,
  installThemeFromRepo,
  previewThemeFromRepo,
  type InstallThemeInput,
  type InstallThemeResult,
  type PreviewThemeResult,
  type ThemeOverview,
  type ThemePreviewImage,
  type ThemeSetting
} from '@/lib/themes'

/**
 * 主题服务层：管理端主题的读/装/激活/卸载。
 *
 * 路由只做参数解析与鉴权；流水线与落盘在 lib/themes/**，
 * 本层负责审计与对管理端的返回契约。
 */

export type { ThemeOverview, ThemePreviewImage }

/** GET /api/v1/admin/themes */
export async function getThemes(): Promise<ThemeOverview> {
  return getThemeOverview()
}

/** POST /api/v1/admin/themes/preview：只读 manifest，不落库 */
export async function previewTheme(input: InstallThemeInput): Promise<PreviewThemeResult> {
  return previewThemeFromRepo(input)
}

/** POST /api/v1/admin/themes/install：安装或升级 */
export async function installTheme(
  actor: AuditContext,
  input: InstallThemeInput
): Promise<InstallThemeResult> {
  const result = await installThemeFromRepo(input)

  await writeAudit(actor, {
    action: 'theme.install',
    targetType: 'theme',
    targetId: result.key,
    message: result.previousVersion
      ? `升级主题 ${result.name} v${result.version}（${result.key}）：v${result.previousVersion} → v${result.version}`
      : `安装主题 ${result.name} v${result.version}（${result.key}）`,
    meta: {
      repoUrl: result.repoUrl,
      ref: result.ref,
      commitSha: result.commitSha,
      distSha256: result.distSha256,
      previousVersion: result.previousVersion
    }
  })

  return result
}

/** POST /api/v1/admin/themes/{key}/activate */
export async function activateTheme(
  actor: AuditContext,
  key: string | null
): Promise<ThemeSetting> {
  const setting = await activateThemeState(key)

  await writeAudit(actor, {
    action: 'theme.activate',
    targetType: 'theme',
    targetId: setting.active ?? 'default',
    message: setting.active ? `激活主题 ${setting.active}` : '停用主题，回落到面板自带落地页',
    meta: { active: setting.active }
  })

  return setting
}

/** DELETE /api/v1/admin/themes/{key} */
export async function deleteTheme(
  actor: AuditContext,
  key: string
): Promise<{ key: string; wasActive: boolean }> {
  const result = await deleteThemeState(key)

  await writeAudit(actor, {
    action: 'theme.delete',
    targetType: 'theme',
    targetId: result.key,
    level: 'warn',
    message: result.wasActive
      ? `卸载主题 ${result.key}（原为激活主题，已回落到面板自带落地页）`
      : `卸载主题 ${result.key}`,
    meta: { wasActive: result.wasActive }
  })

  return result
}

/** GET /api/v1/admin/themes/discover */
export async function discoverThemes(source?: string | null, q?: string) {
  return discoverThemesImpl(source, q)
}

/** GET /api/v1/admin/themes/{key}/preview-image */
export async function getThemePreview(key: string): Promise<ThemePreviewImage> {
  return getThemePreviewImage(key)
}
