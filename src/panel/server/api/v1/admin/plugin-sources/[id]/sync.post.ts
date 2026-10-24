import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { pluginCompareWithInstalled, parseSourceIndex } from '../../../../../utils/plugin-host/source'
import {
  getPluginSource,
  listPlugins,
  updatePluginSource
} from '../../../../../utils/plugin-host/store'

/**
 * POST /api/v1/admin/plugin-sources/:id/sync
 *
 * 手动同步三方源（url 类型）：
 *   拉取 JSON 索引 → 校验每项 checksum → 与已安装版本比对
 *
 * TODO: git / marketplace 类型三方源的同步流程尚未实现。
 */

const SYNC_TIMEOUT_MS = 15_000

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_WRITE)

  const id = getRouterParam(event, 'id')
  const source = id ? await getPluginSource(id) : null

  if (!source) {
    apiError(404, 'PLUGIN_SOURCE_NOT_FOUND', '三方源不存在')
  }

  if (source.type !== 'url') {
    // TODO: git / marketplace 类型三方源尚未实现
    apiError(400, 'PLUGIN_SOURCE_TYPE_UNSUPPORTED', '目前只支持 url 类型的插件三方源', {
      type: source.type
    })
  }

  let body: string
  try {
    const response = await fetch(source.url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS)
    })

    if (!response.ok) {
      throw new Error(`索引拉取失败：HTTP ${response.status}`)
    }

    body = await response.text()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updatePluginSource(source.id, {
      lastSyncAt: new Date(),
      lastStatus: 'failed',
      lastError: message
    })
    apiError(502, 'PLUGIN_SOURCE_SYNC_FAILED', `三方源同步失败：${message}`)
  }

  const index = parseSourceIndex(body)
  const installed = await listPlugins({ page: 1, pageSize: 1000 })
  const comparison = pluginCompareWithInstalled(
    index.entries,
    installed.rows.map(row => ({ key: row.key, version: row.version }))
  )

  await updatePluginSource(source.id, {
    lastSyncAt: new Date(),
    lastStatus: 'success',
    lastError: index.issues.length > 0 ? index.issues.map(issue => issue.message).join('；') : null,
    checksum: index.checksum
  })

  return {
    checksum: index.checksum,
    total: index.entries.length,
    entries: comparison,
    issues: index.issues
  }
})
