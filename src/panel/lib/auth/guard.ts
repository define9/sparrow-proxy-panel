import 'server-only'
import { redirect } from 'next/navigation'
import { getSession } from './session'
import { resolveAccessToken } from './token'
import { ApiError, TOKEN_SCOPE_DENIED } from '@/lib/api/response'
import type { TokenScope } from '@/lib/api/types'
import type { Session } from './types'

export function can(permissions: readonly string[], permission?: string) {
  if (!permission) return true
  return permissions.includes('*') || permissions.includes(permission)
}

/** Server Component 用：未登录跳登录页 */
export async function requireSession(nextPath = '/'): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  return session
}

/** Server Component 用：无权限跳回用户中心 */
export async function requirePermission(permission: string): Promise<Session> {
  const session = await requireSession('/admin')
  if (!can(session.permissions, permission)) redirect('/dashboard')
  return session
}

/** Route Handler 用：未登录抛 401，无权限抛 403 */
export async function requireApiSession(permission?: string): Promise<Session> {
  const session = await getSession()
  if (!session) throw new ApiError(401, 'AUTH_REQUIRED', '请先登录')
  if (!can(session.permissions, permission)) {
    throw new ApiError(403, 'PERM_DENIED', '没有访问该资源的权限')
  }
  return session
}

/**
 * Route Handler 用（用户端只读 GET）：cookie 会话优先，其次 PAT。
 *
 * - 浏览器会话不受 scope 限制（保持现有体验）；
 * - 没有会话时才看 `Authorization: Bearer spx_xxx`，token 必须含 `scope`，否则 403 TOKEN_SCOPE_DENIED；
 * - 两者都没有 / token 无效统一 401 AUTH_REQUIRED，不区分「不存在」与「已吊销」。
 *
 * 只给只读接口用。auth/**、user/password、user/sessions*、user/tokens*、admin/**
 * 继续走 requireApiSession()/requirePermission()，PAT 在那儿一律不生效（只读凭据不能提权）。
 */
export async function requireUserApi(req: Request, scope: TokenScope): Promise<Session> {
  const session = await getSession()
  if (session) return session

  const access = await resolveAccessToken(req)
  if (!access) {
    throw new ApiError(401, 'AUTH_REQUIRED', '请先登录或提供有效的 API Token')
  }

  if (!access.scopes.includes(scope)) {
    throw new ApiError(403, TOKEN_SCOPE_DENIED, `API Token 缺少 ${scope} 权限`, { scope })
  }

  return access.session
}
