import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { toPluginSourceDto } from '../../../../utils/plugin-host/dto'
import { listPluginSources } from '../../../../utils/plugin-host/store'

/**
 * GET /api/v1/admin/plugin-sources
 *
 * 三方源列表。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_READ)

  const rows = await listPluginSources()

  return {
    data: rows.map(toPluginSourceDto),
    meta: {
      total: rows.length,
      page: 1,
      pageSize: rows.length,
      hasMore: false,
      nextCursor: null
    }
  }
})
