import { asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { nodeCertificates, nodes } from '@/lib/db/schema'
import { ApiError, created, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { certificateInputSchema } from '@/lib/api/node-schemas'
import { daysUntil, parseCertificateValidity } from '@/lib/api/cert'

export function serializeCertificate(row: typeof nodeCertificates.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    issuer: row.issuer,
    notBefore: row.notBefore?.toISOString() ?? null,
    notAfter: row.notAfter?.toISOString() ?? null,
    /** 前端用不到完整 PEM，只给到期信息 */
    daysLeft: daysUntil(row.notAfter),
    source: row.source,
    autoRenew: row.source === 'acme',
    createdAt: row.createdAt.toISOString()
  }
}

export const GET = route(async () => {
  await requireApiSession('admin:node:read')

  const [rows, [bound]] = await Promise.all([
    db.select().from(nodeCertificates).orderBy(asc(nodeCertificates.notAfter)),
    db.select({ total: sql<number>`count(*)::int` }).from(nodes)
  ])

  return ok({
    data: rows.map(serializeCertificate),
    meta: { total: rows.length, usageCount: bound?.total ?? 0 }
  })
})

export const POST = route(async (req: Request) => {
  await requireApiSession('admin:node:write')
  const body = certificateInputSchema.parse(await req.json())

  // 不引第三方 x509 库：优先用请求里显式给的 notAfter，其次从 PEM 里扫时间，最后 +90 天占位
  const parsed = parseCertificateValidity(body.cert)
  const notBefore = body.notBefore ? new Date(body.notBefore) : parsed.notBefore ?? new Date()
  const notAfter = body.notAfter
    ? new Date(body.notAfter)
    : parsed.notAfter ?? new Date(Date.now() + 90 * 86_400_000)

  if (Number.isNaN(notBefore.getTime()) || Number.isNaN(notAfter.getTime())) {
    throw new ApiError(422, 'NODE_CERT_INVALID', '证书有效期解析失败', { field: 'notAfter' })
  }
  if (notAfter <= notBefore) {
    throw new ApiError(422, 'NODE_CERT_INVALID', '证书到期时间必须晚于生效时间', {
      field: 'notAfter'
    })
  }

  const [row] = await db
    .insert(nodeCertificates)
    .values({
      name: body.name,
      type: body.type,
      cert: body.cert,
      key: body.key,
      issuer: body.issuer ?? null,
      notBefore,
      notAfter,
      source: body.source
    })
    .returning()

  return created(serializeCertificate(row!))
})
