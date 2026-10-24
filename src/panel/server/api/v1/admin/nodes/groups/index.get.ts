import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { asc, count, sql } from 'drizzle-orm'
import { nodeGroups, nodes } from '../../../../../../drizzle/schema'
import { toNodeGroupDto } from '../../../../../utils/node'

/**
 * GET /api/v1/admin/nodes/groups
 *
 * 节点组列表（含节点数与在线数）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_READ)

  const db = useDb()

  const [rows, counts] = await Promise.all([
    db.select().from(nodeGroups).orderBy(asc(nodeGroups.sort), asc(nodeGroups.name)),
    db
      .select({
        groupId: nodes.groupId,
        nodeCount: count(),
        onlineCount: sql<number>`(count(*) filter (where ${nodes.status} = 'online'))::int`
      })
      .from(nodes)
      .groupBy(nodes.groupId)
  ])

  const countMap = new Map(counts.map(item => [item.groupId, item]))

  return {
    data: rows.map((row) => {
      const stat = countMap.get(row.id)
      return toNodeGroupDto(row, {
        nodeCount: stat?.nodeCount ?? 0,
        onlineCount: stat?.onlineCount ?? 0
      })
    })
  }
})
