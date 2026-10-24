import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { asc } from 'drizzle-orm'
import { nodeCertificates } from '../../../../../../drizzle/schema'
import { toCertificateDto } from '../../../../../utils/node'

/**
 * GET /api/v1/admin/nodes/certificates
 *
 * 证书列表（私钥脱敏，附带到期天数与临期标记）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_READ)

  const db = useDb()
  const rows = await db
    .select()
    .from(nodeCertificates)
    .orderBy(asc(nodeCertificates.name))

  return {
    data: rows.map(row => toCertificateDto(row))
  }
})
