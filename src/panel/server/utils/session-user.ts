import type { H3Event } from 'h3'
import { getSessionUser, type SessionUser } from './auth'

/**
 * 用户端接口的登录校验。
 *
 * 与 `requirePermission`（管理端）分开：用户端只需要登录态，
 * 不做权限点判定。
 */
export async function requireSessionUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_TOKEN_EXPIRED',
      message: '请先登录',
      data: { code: 'AUTH_TOKEN_EXPIRED', message: '请先登录' }
    })
  }

  return user
}
