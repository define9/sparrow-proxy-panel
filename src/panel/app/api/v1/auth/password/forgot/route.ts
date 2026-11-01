import { ok, route } from '@/lib/api/response'
import { forgotPasswordSchema } from '@/lib/api/schemas'
import { requestPasswordReset } from '@/lib/services/auth'

export const POST = route(async (req: Request) => {
  const { email } = forgotPasswordSchema.parse(await req.json())
  return ok(await requestPasswordReset(email))
})
