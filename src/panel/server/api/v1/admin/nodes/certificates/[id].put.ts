import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { nodeCertificates } from '../../../../../../drizzle/schema'
import { getPathParam, inspectCertificate, loadCertificateRow, toCertificateDto } from '../../../../../utils/node'
import { validateBody } from '../../../../../utils/validate'

/**
 * PUT /api/v1/admin/nodes/certificates/:id
 *
 * 更新证书。
 *
 * `cert` / `key` 未提供时保留原值；私钥永不回显。
 */
const certificateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  cert: z.string().trim().min(1).optional(),
  key: z.string().trim().optional(),
  type: z.enum(['generic', 'custom']).optional(),
  source: z.enum(['acme', 'manual']).optional(),
  issuer: z.string().trim().max(255).nullish(),
  notBefore: z.coerce.date().nullish(),
  notAfter: z.coerce.date().nullish(),
  acmeConfig: z.record(z.string(), z.unknown()).optional()
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_WRITE)

  const id = getPathParam(event, 'id')
  const body = await validateBody(event, certificateSchema)
  const db = useDb()

  const current = await loadCertificateRow(id)

  const cert = body.cert ?? current.cert
  const inspected = body.cert ? inspectCertificate(body.cert) : {}

  await db
    .update(nodeCertificates)
    .set({
      name: body.name,
      cert,
      key: body.key ?? current.key,
      type: body.type ?? current.type,
      source: body.source ?? current.source,
      issuer: body.issuer ?? inspected.issuer ?? current.issuer,
      notBefore: body.notBefore ?? inspected.notBefore ?? current.notBefore,
      notAfter: body.notAfter ?? inspected.notAfter ?? current.notAfter,
      acmeConfig: body.acmeConfig ?? current.acmeConfig,
      updatedAt: new Date()
    })
    .where(eq(nodeCertificates.id, id))

  const updated = await loadCertificateRow(id)

  return toCertificateDto(updated)
})
