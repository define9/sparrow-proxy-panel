import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { count, eq } from 'drizzle-orm'
import { nodeGroups, nodes } from '../../../../../../drizzle/schema'
import { getPathParam, loadNodeGroupRow } from '../../../../../utils/node'

/**
 * DELETE /api/v1/admin/nodes/groups/:id
 *
 * 删除节点组。组内仍有节点时拒绝删除（避免节点变成孤儿）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_DELETE)

  const id = getPathParam(event, 'id')
  await loadNodeGroupRow(id)

  const db = useDb()

  const [stat] = await db
    .select({ value: count() })
    .from(nodes)
    .where(eq(nodes.groupId, id))

  if ((stat?.value ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NODE_GROUP_NOT_EMPTY',
      message: '节点组内仍有节点，无法删除',
      data: { code: 'NODE_GROUP_NOT_EMPTY', message: '节点组内仍有节点，无法删除' }
    })
  }

  await db.delete(nodeGroups).where(eq(nodeGroups.id, id))

  return { ok: true }
})
