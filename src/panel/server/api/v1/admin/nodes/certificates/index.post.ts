import { PERMISSIONS } from '@sparrow/contracts/permissions'
import { z } from 'zod'
import { nodeCertificates } from '../../../../../../drizzle/schema'
import { inspectCertificate, toCertificateDto } from '../../../../../utils/node'
import { validateBody } from '../../../../../utils/validate'

/**
 * POST /api/v1/admin/nodes/certificates
 *
 * 新增证书。
 *
 * 证书私钥**只写不读**：接口永不回显私钥内容（DTO 里 `key` 为掩码）。
 * 主密钥加密留待协调者统一实现（本期按明文落库）。
 */
const certificateSchema = z.object({
  name: z.string().trim().min(1).max(128),
  cert: z.string().trim().min(1),
  key: z.string().trim().optional(),
  type: z.enum(['generic', 'custom']).default('custom'),
  source: z.enum(['acme', 'manual']).default('manual'),
  issuer: z.string().trim().max(255).nullish(),
  notBefore: z.coerce.date().nullish(),
  notAfter: z.coerce.date().nullish(),
  acmeConfig: z.record(z.string(), z.unknown()).default({})
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, PERMISSIONS.ADMIN_NODE_WRITE)

  const body = await validateBody(event, certificateSchema)
  const db = useDb()

  const inspected = inspectCertificate(body.cert)

  const [created] = await db
    .insert(nodeCertificates)
    .values({
      name: body.name,
      type: body.type,
      source: body.source,
      cert: body.cert,
      key: body.key ?? '',
      issuer: body.issuer ?? inspected.issuer ?? null,
      notBefore: body.notBefore ?? inspected.notBefore ?? null,
      notAfter: body.notAfter ?? inspected.notAfter ?? null,
      acmeConfig: body.acmeConfig
    })
    .returning()

  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: 'INTERNAL_ERROR',
      message: '证书创建失败',
      data: { code: 'INTERNAL_ERROR', message: '证书创建失败' }
    })
  }

  return toCertificateDto(created)
})
