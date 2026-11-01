import { clientIp, ok, route } from '@/lib/api/response'
import { requireApiSession } from '@/lib/auth/guard'
import { settingsSchema } from '@/lib/api/schemas'
import { getSettings, updateSettings } from '@/lib/services/settings'

export const GET = route(async () => {
  await requireApiSession('admin:settings:read')
  return ok(await getSettings())
})

export const PUT = route(async (req: Request) => {
  const session = await requireApiSession('admin:settings:write')
  const body = settingsSchema.partial().parse(await req.json())

  const actor = { id: session.user.id, label: session.user.email, ip: clientIp(req) }
  return ok(await updateSettings(actor, body))
})
