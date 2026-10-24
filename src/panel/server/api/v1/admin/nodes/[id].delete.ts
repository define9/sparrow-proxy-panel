import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { nodeConfigs, nodes } from '../../../../../drizzle/schema'
import { getPathParam, loadNodeRow } from '../../../../utils/node'

/**
 * DELETE /api/v1/admin/nodes/:id
 *
 * 删除节点（连带删除密钥、心跳与配置缓存；命令与事件保留为历史记录）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_DELETE)

  const id = getPathParam(event, 'id')
  await loadNodeRow(id)

  const db = useDb()

  await db.delete(nodeConfigs).where(eq(nodeConfigs.nodeId, id))
  await db.delete(nodes).where(eq(nodes.id, id))

  return { ok: true }
})
