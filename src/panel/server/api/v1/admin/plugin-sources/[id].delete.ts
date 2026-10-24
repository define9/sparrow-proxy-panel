import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { deletePluginSource, getPluginSource } from '../../../../utils/plugin-host/store'

/**
 * DELETE /api/v1/admin/plugin-sources/:id
 *
 * 删除三方源。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_DELETE)

  const id = getRouterParam(event, 'id')
  const row = id ? await getPluginSource(id) : null

  if (!row) {
    apiError(404, 'PLUGIN_SOURCE_NOT_FOUND', '三方源不存在')
  }

  await deletePluginSource(row.id)

  setResponseStatus(event, 204)
  return null
})
