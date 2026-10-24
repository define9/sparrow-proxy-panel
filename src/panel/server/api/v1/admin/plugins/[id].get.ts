import type { PluginManifest } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { maskPluginConfig, pluginConfigSchema } from '../../../../utils/plugin-host/config'
import { toPluginDto } from '../../../../utils/plugin-host/dto'
import { getPluginHost } from '../../../../utils/plugin-host/runtime'
import { getPluginById, pluginEventStats } from '../../../../utils/plugin-host/store'

/**
 * GET /api/v1/admin/plugins/:id
 *
 * 插件详情：manifest 解读、脱敏配置、配置表单字段、调用统计与熔断状态。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_READ)

  const id = getRouterParam(event, 'id')
  const row = id ? await getPluginById(id) : null

  if (!row) {
    apiError(404, 'PLUGIN_NOT_FOUND', '插件不存在')
  }

  const manifest = row.manifest as unknown as PluginManifest
  const schema = pluginConfigSchema(manifest)
  const stats = await pluginEventStats(row.id)
  const circuit = getPluginHost().circuitBreaker.getState(row.key)

  return {
    ...toPluginDto(row),
    manifest,
    config: maskPluginConfig(manifest, row.config),
    // 配置表单由 manifest.configSchema 自动生成
    configFields: schema.fields,
    stats,
    circuit: {
      open: circuit.openUntil !== null,
      failures: circuit.failures
    }
  }
})
