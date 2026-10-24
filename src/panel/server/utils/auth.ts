import type { H3Event } from 'h3'

export interface SessionUser {
  id: string
  email: string
  username: string
  role: string
  permissions: string[]
}

/** 取当前会话用户，未登录返回 null */
export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await getUserSession(event)
  return (session.user as SessionUser | undefined) ?? null
}

/**
 * 校验权限点。
 *
 * 权限点定义在 packages/contracts/src/permissions.ts，
 * 前端菜单过滤与这里使用同一套字符串。
 */
export async function requirePermission(event: H3Event, permission: string): Promise<SessionUser> {
  const user = await getSessionUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_TOKEN_EXPIRED',
      message: '请先登录',
      data: { code: 'AUTH_TOKEN_EXPIRED', message: '请先登录' }
    })
  }

  const permissions = user.permissions ?? []
  if (!permissions.includes('*') && !permissions.includes(permission)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'PERM_DENIED',
      message: '权限不足',
      data: { code: 'PERM_DENIED', message: '权限不足' }
    })
  }

  return user
}
