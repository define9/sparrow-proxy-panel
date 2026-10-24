import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { deletePlugin, getPluginById } from '../../../../utils/plugin-host/store'

/**
 * DELETE /api/v1/admin/plugins/:id
 *
 * 卸载插件（同时清理调用事件）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_PLUGIN_DELETE)

  const id = getRouterParam(event, 'id')
  const row = id ? await getPluginById(id) : null

  if (!row) {
    apiError(404, 'PLUGIN_NOT_FOUND', '插件不存在')
  }

  await deletePlugin(row.id)

  setResponseStatus(event, 204)
  return null
})
