import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { toPageMeta, toPluginEventDto } from '../../../../../utils/plugin-host/dto'
import { parsePaginationQuery } from '../../../../../utils/plugin-host/request'
import { getPluginById, listPluginEvents } from '../../../../../utils/plugin-host/store'

/**
 * GET /api/v1/admin/plugins/:id/events
 *
 * 插件调用日志（plugin_events）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_READ)

  const id = getRouterParam(event, 'id')
  const row = id ? await getPluginById(id) : null

  if (!row) {
    apiError(404, 'PLUGIN_NOT_FOUND', '插件不存在')
  }

  const query = getQuery(event)
  const { page, pageSize } = parsePaginationQuery(query)

  const { rows, total } = await listPluginEvents(row.id, { page, pageSize })

  return {
    data: rows.map(toPluginEventDto),
    meta: toPageMeta(total, page, pageSize)
  }
})
