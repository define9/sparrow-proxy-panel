import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roles, users } from '@/lib/db/schema'
import { ApiError, clientIp, ok, route } from '@/lib/api/response'
import { loginSchema } from '@/lib/api/schemas'
import { verifyPassword } from '@/lib/auth/password'
import { createSession, recordLogin } from '@/lib/auth/session'

export const POST = route(async (req: Request) => {
  const body = loginSchema.parse(await req.json())
  const email = body.email.toLowerCase()

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      passwordHash: users.passwordHash,
      status: users.status,
      roleCode: users.roleCode,
      permissions: roles.permissions
    })
    .from(users)
    .leftJoin(roles, sql`${roles.code} = ${users.roleCode}`)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (!row) {
    await recordLogin({
      email,
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
      success: false,
      reason: 'user_not_found'
    })
    throw new ApiError(401, 'AUTH_INVALID_CREDENTIALS', '邮箱或密码不正确')
  }

  if (row.status === 'disabled') {
    await recordLogin({ userId: row.id, email, success: false, reason: 'disabled' })
    throw new ApiError(403, 'USER_DISABLED', '账号已被禁用')
  }

  const valid = await verifyPassword(row.passwordHash, body.password)
  if (!valid) {
    await recordLogin({
      userId: row.id,
      email,
      ip: clientIp(req),
      userAgent: req.headers.get('user-agent') ?? undefined,
      success: false,
      reason: 'bad_password'
    })
    throw new ApiError(401, 'AUTH_INVALID_CREDENTIALS', '邮箱或密码不正确')
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(sql`${users.id} = ${row.id}`)

  await createSession(row.id, {
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent') ?? undefined
  })

  await recordLogin({
    userId: row.id,
    email,
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent') ?? undefined,
    success: true
  })

  return ok({
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.roleCode,
      status: row.status
    },
    permissions: row.permissions ?? []
  })
})
