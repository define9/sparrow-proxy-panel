import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { nodeGroups } from '../../../../../drizzle/schema'
import { getPathParam, loadNodeRow, toNodeDto } from '../../../../utils/node'

/**
 * GET /api/v1/admin/nodes/:id
 *
 * 节点详情。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_READ)

  const id = getPathParam(event, 'id')
  const row = await loadNodeRow(id)

  const db = useDb()
  const [group] = await db
    .select({ name: nodeGroups.name })
    .from(nodeGroups)
    .where(eq(nodeGroups.id, row.groupId))
    .limit(1)

  return toNodeDto(row, group?.name)
})
