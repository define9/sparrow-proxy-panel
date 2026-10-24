import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { nodeGroups } from '../../../../../../drizzle/schema'
import { getPathParam, loadNodeGroupRow, toNodeGroupDto } from '../../../../../utils/node'
import { validateBody } from '../../../../../utils/validate'

/**
 * PUT /api/v1/admin/nodes/groups/:id
 *
 * 更新节点组。
 */
const groupSchema = z.object({
  name: z.string().trim().min(1).max(64),
  sort: z.number().int().default(0),
  region: z.string().trim().max(64).nullish(),
  remark: z.string().trim().max(500).nullish()
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_WRITE)

  const id = getPathParam(event, 'id')
  const body = await validateBody(event, groupSchema)
  const db = useDb()

  await loadNodeGroupRow(id)

  const [existed] = await db
    .select({ id: nodeGroups.id })
    .from(nodeGroups)
    .where(eq(nodeGroups.name, body.name))
    .limit(1)

  if (existed && existed.id !== id) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NODE_GROUP_DUPLICATED',
      message: '节点组名称已存在',
      data: { code: 'NODE_GROUP_DUPLICATED', message: '节点组名称已存在' }
    })
  }

  await db
    .update(nodeGroups)
    .set({
      name: body.name,
      sort: body.sort,
      region: body.region ?? null,
      remark: body.remark ?? null
    })
    .where(eq(nodeGroups.id, id))

  const updated = await loadNodeGroupRow(id)

  return toNodeGroupDto(updated)
})
