import { ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { mailTestSchema } from '@/lib/api/schemas'
import { sendTestMail } from '@/lib/services/mail'

export const POST = route(async (req: Request) => {
  await requireApiSession('admin:settings:write')
  const { to } = mailTestSchema.parse(await req.json())
  return ok(await sendTestMail(to))
})
