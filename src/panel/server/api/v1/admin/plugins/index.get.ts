import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { toPageMeta, toPluginDto } from '../../../../utils/plugin-host/dto'
import {
  parseKeyword,
  parsePaginationQuery,
  parsePluginStatus,
  parsePluginType
} from '../../../../utils/plugin-host/request'
import { listPlugins } from '../../../../utils/plugin-host/store'

/**
 * GET /api/v1/admin/plugins
 *
 * 插件列表（分页 + 关键词 + 状态 / 类型过滤）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_READ)

  const query = getQuery(event)
  const { page, pageSize } = parsePaginationQuery(query)

  const { rows, total } = await listPlugins({
    page,
    pageSize,
    q: parseKeyword(query),
    status: parsePluginStatus(query.status),
    type: parsePluginType(query.type)
  })

  return {
    data: rows.map(toPluginDto),
    meta: toPageMeta(total, page, pageSize)
  }
})
