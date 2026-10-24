import { LoginRequestSchema } from '@sparrow/contracts'
import { eq } from 'drizzle-orm'
import { permissions, rolePermissions, roles, users } from '../../../../drizzle/schema'
import { scryptVerify } from '../../../utils/password'
import { validateBody } from '../../../utils/validate'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, LoginRequestSchema)

  const db = useDb()

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_INVALID_CREDENTIALS',
      message: '邮箱或密码错误',
      data: { code: 'AUTH_INVALID_CREDENTIALS', message: '邮箱或密码错误' }
    })
  }

  if (user.status === 'disabled') {
    throw createError({
      statusCode: 403,
      statusMessage: 'USER_DISABLED',
      message: '账号已被禁用',
      data: { code: 'USER_DISABLED', message: '账号已被禁用' }
    })
  }

  const valid = await scryptVerify(body.password, user.passwordHash)
  if (!valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_INVALID_CREDENTIALS',
      message: '邮箱或密码错误',
      data: { code: 'AUTH_INVALID_CREDENTIALS', message: '邮箱或密码错误' }
    })
  }

  const [role] = await db.select().from(roles).where(eq(roles.id, user.roleId)).limit(1)

  const granted = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, user.roleId))

  const permissionList = role?.code === 'superadmin'
    ? ['*']
    : granted.map(item => item.code)

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: role?.code ?? 'user',
      permissions: permissionList
    },
    loggedIn: true
  })

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id))

  return { ok: true }
})
