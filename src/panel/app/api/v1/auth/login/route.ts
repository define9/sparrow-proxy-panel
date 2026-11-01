import { clientIp, ok, route } from '@/lib/api/response'
import { loginSchema } from '@/lib/api/schemas'
import { login } from '@/lib/services/auth'

export const POST = route(async (req: Request) => {
  const body = loginSchema.parse(await req.json())

  return ok(
    await login({
      email: body.email,
      password: body.password,
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined
    })
  )
})
