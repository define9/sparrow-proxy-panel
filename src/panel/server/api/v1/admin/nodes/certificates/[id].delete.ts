import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { nodeCertificates } from '../../../../../../drizzle/schema'
import { getPathParam, loadCertificateRow } from '../../../../../utils/node'

/**
 * DELETE /api/v1/admin/nodes/certificates/:id
 *
 * 删除证书（引用该证书的节点会置空 `certificate_id`）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_DELETE)

  const id = getPathParam(event, 'id')
  await loadCertificateRow(id)

  const db = useDb()
  await db.delete(nodeCertificates).where(eq(nodeCertificates.id, id))

  return { ok: true }
})
