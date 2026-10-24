import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { nodeGroups } from '../../../../../../drizzle/schema'
import { toNodeGroupDto } from '../../../../../utils/node'
import { validateBody } from '../../../../../utils/validate'

/**
 * POST /api/v1/admin/nodes/groups
 *
 * 新建节点组。
 */
const groupSchema = z.object({
  name: z.string().trim().min(1).max(64),
  sort: z.number().int().default(0),
  region: z.string().trim().max(64).nullish(),
  remark: z.string().trim().max(500).nullish()
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_WRITE)

  const body = await validateBody(event, groupSchema)
  const db = useDb()

  const [existed] = await db
    .select({ id: nodeGroups.id })
    .from(nodeGroups)
    .where(eq(nodeGroups.name, body.name))
    .limit(1)

  if (existed) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NODE_GROUP_DUPLICATED',
      message: '节点组名称已存在',
      data: { code: 'NODE_GROUP_DUPLICATED', message: '节点组名称已存在' }
    })
  }

  const [created] = await db
    .insert(nodeGroups)
    .values({
      name: body.name,
      sort: body.sort,
      region: body.region ?? null,
      remark: body.remark ?? null
    })
    .returning()

  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: 'INTERNAL_ERROR',
      message: '节点组创建失败',
      data: { code: 'INTERNAL_ERROR', message: '节点组创建失败' }
    })
  }

  return toNodeGroupDto(created, { nodeCount: 0, onlineCount: 0 })
})
