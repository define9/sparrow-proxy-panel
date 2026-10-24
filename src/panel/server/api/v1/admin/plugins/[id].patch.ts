import type { PluginManifest } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { mergePluginConfig } from '../../../../utils/plugin-host/config'
import { toPluginDto } from '../../../../utils/plugin-host/dto'
import { getPluginById, updatePlugin } from '../../../../utils/plugin-host/store'

/**
 * PATCH /api/v1/admin/plugins/:id
 *
 * 更新插件：启用 / 禁用、更新配置、改名改版本。
 *
 * 配置按 manifest.configSchema 校验；secret 字段回传脱敏占位符时保留原值。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_WRITE)

  const id = getRouterParam(event, 'id')
  const row = id ? await getPluginById(id) : null

  if (!row) {
    apiError(404, 'PLUGIN_NOT_FOUND', '插件不存在')
  }

  const body = await readBody(event) as Record<string, unknown> | undefined
  if (!body) {
    apiError(422, 'VALIDATION_FAILED', '缺少请求体')
  }

  const patch: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (body.status !== 'installed' && body.status !== 'disabled') {
      apiError(422, 'VALIDATION_FAILED', '状态只能是 installed 或 disabled')
    }
    patch.status = body.status
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      apiError(422, 'VALIDATION_FAILED', '插件名称不能为空')
    }
    patch.name = body.name.trim()
  }

  if (body.version !== undefined) {
    if (typeof body.version !== 'string' || !body.version.trim()) {
      apiError(422, 'VALIDATION_FAILED', '插件版本不能为空')
    }
    patch.version = body.version.trim()
  }

  if (body.config !== undefined) {
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      apiError(422, 'VALIDATION_FAILED', '配置必须是对象')
    }
    const manifest = row.manifest as unknown as PluginManifest
    const { config, issues } = mergePluginConfig(manifest, row.config, body.config as Record<string, unknown>)

    if (issues.length > 0) {
      apiError(422, 'PLUGIN_CONFIG_INVALID', '插件配置校验失败', { issues })
    }
    patch.config = config
  }

  if (Object.keys(patch).length === 0) {
    apiError(422, 'VALIDATION_FAILED', '没有可更新的字段')
  }

  const updated = await updatePlugin(row.id, patch)

  if (!updated) {
    apiError(404, 'PLUGIN_NOT_FOUND', '插件不存在')
  }

  return toPluginDto(updated)
})
