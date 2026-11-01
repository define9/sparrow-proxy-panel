import { created, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { certificateInputSchema } from '@/lib/api/node-schemas'
import { createCertificate, listCertificates } from '@/lib/services/nodes'

export const GET = route(async () => {
  await requireApiSession('admin:node:read')

  return ok(await listCertificates())
})

export const POST = route(async (req: Request) => {
  const session = await requireApiSession('admin:node:write')
  const body = certificateInputSchema.parse(await req.json())

  return created(await createCertificate(session.user.id, body))
})
