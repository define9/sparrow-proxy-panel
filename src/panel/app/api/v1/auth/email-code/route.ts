import { z } from 'zod'
import { ok, route } from '@/lib/api/response'
import { issueCode } from '@/lib/auth/verification'

const schema = z.object({ email: z.string().email() })

export const POST = route(async (req: Request) => {
  const { email } = schema.parse(await req.json())
  const code = issueCode(email)

  // 演示环境把验证码直接返回，接入邮件插件后删除该字段
  return ok({
    sent: true,
    expiresIn: 600,
    devCode: process.env.NODE_ENV === 'production' ? undefined : code
  })
})
