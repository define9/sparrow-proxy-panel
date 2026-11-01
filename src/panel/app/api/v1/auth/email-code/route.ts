import { z } from 'zod'
import { ok, route } from '@/lib/api/response'
import { sendLoginCode } from '@/lib/services/auth'

const schema = z.object({ email: z.string().email() })

export const POST = route(async (req: Request) => {
  const { email } = schema.parse(await req.json())
  return ok(await sendLoginCode(email))
})
