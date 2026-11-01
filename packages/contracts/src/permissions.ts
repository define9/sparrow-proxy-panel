/**
 * 权限点：前端菜单、后端校验共用同一份字符串。
 * 命名：<域>:<资源>:<动作>
 */
export const PERMISSIONS = [
  'admin:dashboard:read',
  'admin:plan:read',
  'admin:plan:write',
  'admin:plan:delete',
  'admin:order:read',
  'admin:order:write',
  'admin:order:refund',
  'admin:subscription:read',
  'admin:subscription:write',
  'admin:node:read',
  'admin:node:write',
  'admin:node:delete',
  'admin:user:read',
  'admin:user:write',
  'admin:user:balance',
  'admin:plugin:read',
  'admin:plugin:write',
  'admin:plugin:delete',
  'admin:log:read',
  'admin:coupon:read',
  'admin:coupon:write',
  'admin:settings:read',
  'admin:settings:write',
  'admin:role:read'
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ALL_PERMISSIONS: string[] = [...PERMISSIONS]

/** 角色 → 权限点（演示用，真实实现来自 roles / role_permissions 表） */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  user: [],
  admin: PERMISSIONS.filter((p) => !p.startsWith('admin:plugin:delete')).map(String),
  superadmin: ['*']
}

export function hasPermission(granted: readonly string[], permission?: string): boolean {
  if (!permission) return true
  return granted.includes('*') || granted.includes(permission)
}
