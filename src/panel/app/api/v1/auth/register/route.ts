import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { ApiError, clientIp, created, route } from '@/lib/api/response'
import { registerSchema } from '@/lib/api/schemas'
import { hashPassword } from '@/lib/auth/password'
import { createSession, recordLogin } from '@/lib/auth/session'
import { verifyCode } from '@/lib/auth/verification'

export const POST = route(async (req: Request) => {
  const body = registerSchema.parse(await req.json())
  const email = body.email.toLowerCase()

  if (body.password !== body.confirmPassword) {
    throw new ApiError(422, 'USER_PASSWORD_MISMATCH', '两次输入的密码不一致', {
      field: 'confirmPassword'
    })
  }

  if (!verifyCode(email, body.code)) {
    throw new ApiError(422, 'AUTH_CODE_INVALID', '验证码错误或已过期', { field: 'code' })
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (existing) {
    throw new ApiError(409, 'USER_EMAIL_TAKEN', '该邮箱已注册', { field: 'email' })
  }

  const passwordHash = await hashPassword(body.password)
  const [user] = await db
    .insert(users)
    .values({
      email,
      username: email.split('@')[0],
      passwordHash,
      roleCode: 'user',
      status: 'active'
    })
    .returning({ id: users.id, email: users.email, username: users.username })

  await createSession(user.id, {
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent') ?? undefined
  })
  await recordLogin({ userId: user.id, email, success: true, reason: 'register' })

  return created({ user, permissions: [] })
})
