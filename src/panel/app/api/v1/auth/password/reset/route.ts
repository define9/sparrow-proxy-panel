import { ok, route } from '@/lib/api/response'
import { resetPasswordSchema } from '@/lib/api/schemas'
import { resetPassword } from '@/lib/services/auth'

export const POST = route(async (req: Request) => {
  const body = resetPasswordSchema.parse(await req.json())
  return ok(await resetPassword(body))
})
