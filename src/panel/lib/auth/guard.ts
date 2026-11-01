import 'server-only'
import { redirect } from 'next/navigation'
import { getSession } from './session'
import { ApiError } from '@/lib/api/response'
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
