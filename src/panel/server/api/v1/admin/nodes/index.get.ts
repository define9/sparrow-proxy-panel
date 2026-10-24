import { PaginationQuerySchema } from '@sparrow/contracts'
import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { and, asc, count, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { nodeGroups, nodes } from '../../../../../drizzle/schema'
import { buildPaginationMeta, parseQuery, toNodeDto } from '../../../../utils/node'

/**
 * GET /api/v1/admin/nodes
 *
 * 节点列表（分页 + 关键词 + 状态/协议/节点组筛选）。
 */
const listQuerySchema = PaginationQuerySchema.extend({
  groupId: z.uuid().optional(),
  status: z.enum(['online', 'offline', 'maintenance']).optional(),
  protocol: z.enum(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic']).optional()
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_READ)

  const query = await parseQuery(event, listQuerySchema)
  const page = query.page ?? 1
  const pageSize = query.pageSize

  const conditions = []
  if (query.q) {
    const keyword = `%${query.q}%`
    conditions.push(or(like(nodes.name, keyword), like(nodes.host, keyword), like(nodes.remark, keyword)))
  }
  if (query.groupId) {
    conditions.push(eq(nodes.groupId, query.groupId))
  }
  if (query.status) {
    conditions.push(eq(nodes.status, query.status))
  }
  if (query.protocol) {
    conditions.push(eq(nodes.protocol, query.protocol))
  }
  const where = conditions.length ? and(...conditions) : undefined

  const db = useDb()

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ node: nodes, groupName: nodeGroups.name })
      .from(nodes)
      .leftJoin(nodeGroups, eq(nodes.groupId, nodeGroups.id))
      .where(where)
      .orderBy(asc(nodes.sort), asc(nodes.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(nodes).where(where)
  ])

  const total = totalRow?.value ?? 0

  return {
    data: rows.map(row => toNodeDto(row.node, row.groupName)),
    meta: buildPaginationMeta(total, page, pageSize)
  }
})
