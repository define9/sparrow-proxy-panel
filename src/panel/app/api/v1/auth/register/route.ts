import { clientIp, created, route } from '@/lib/api/response'
import { registerSchema } from '@/lib/api/schemas'
import { register } from '@/lib/services/auth'

export const POST = route(async (req: Request) => {
  const body = registerSchema.parse(await req.json())

  return created(
    await register({
      email: body.email,
      code: body.code,
      password: body.password,
      confirmPassword: body.confirmPassword,
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined
    })
  )
})
