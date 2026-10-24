import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'
import { nodes } from '../../../../../drizzle/schema'
import { validateBody } from '../../../../utils/validate'

/**
 * POST /api/v1/admin/nodes/batch
 *
 * 批量启停节点。
 *
 * - `action: 'enable'` → 状态置为 `online`
 * - `action: 'disable'` → 状态置为 `offline`
 * - 或直接给 `status`（`online` / `offline` / `maintenance`）
 */
const batchSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  action: z.enum(['enable', 'disable']).optional(),
  status: z.enum(['online', 'offline', 'maintenance']).optional()
}).refine(value => Boolean(value.action || value.status), {
  message: '必须提供 action 或 status'
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_WRITE)

  const body = await validateBody(event, batchSchema)

  const status = body.status ?? (body.action === 'enable' ? 'online' : 'offline')

  const db = useDb()

  const updated = await db
    .update(nodes)
    .set({ status, updatedAt: new Date() })
    .where(inArray(nodes.id, body.ids))
    .returning({ id: nodes.id })

  return {
    ok: true,
    status,
    affected: updated.length
  }
})
