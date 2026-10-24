/**
 * 权限点定义 —— 前后端共用的唯一来源。
 *
 * - 前端：菜单过滤、按钮显隐（app/utils/navigation.ts）
 * - 后端：requirePermission('admin:node:write')（server/api/admin/**）
 *
 * 命名规则：<域>:<资源>:<动作>
 */

export const PERMISSIONS = {
  // 仪表盘
  ADMIN_DASHBOARD_READ: 'admin:dashboard:read',

  // 商品
  ADMIN_PLAN_READ: 'admin:plan:read',
  ADMIN_PLAN_WRITE: 'admin:plan:write',
  ADMIN_PLAN_DELETE: 'admin:plan:delete',

  // 订单
  ADMIN_ORDER_READ: 'admin:order:read',
  ADMIN_ORDER_WRITE: 'admin:order:write',
  ADMIN_ORDER_REFUND: 'admin:order:refund',

  // 订阅
  ADMIN_SUBSCRIPTION_READ: 'admin:subscription:read',
  ADMIN_SUBSCRIPTION_WRITE: 'admin:subscription:write',

  // 节点
  ADMIN_NODE_READ: 'admin:node:read',
  ADMIN_NODE_WRITE: 'admin:node:write',
  ADMIN_NODE_DELETE: 'admin:node:delete',

  // 用户
  ADMIN_USER_READ: 'admin:user:read',
  ADMIN_USER_WRITE: 'admin:user:write',
  ADMIN_USER_BALANCE: 'admin:user:balance',

  // 插件
  ADMIN_PLUGIN_READ: 'admin:plugin:read',
  ADMIN_PLUGIN_WRITE: 'admin:plugin:write',
  ADMIN_PLUGIN_DELETE: 'admin:plugin:delete',

  // 日志
  ADMIN_LOG_READ: 'admin:log:read',

  // 系统
  ADMIN_SETTINGS_READ: 'admin:settings:read',
  ADMIN_SETTINGS_WRITE: 'admin:settings:write',
  ADMIN_COUPON_READ: 'admin:coupon:read',
  ADMIN_COUPON_WRITE: 'admin:coupon:write',
  ADMIN_ROLE_READ: 'admin:role:read'
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | typeof SUPER_ADMIN_PERMISSION

export const PERMISSION_LIST: Permission[] = Object.values(PERMISSIONS)

/** 超级管理员通配符 */
export const SUPER_ADMIN_PERMISSION = '*'

/** 内置角色与其权限集合 */
export const BUILTIN_ROLES: Record<string, Permission[]> = {
  user: [],
  admin: [
    PERMISSIONS.ADMIN_DASHBOARD_READ,
    PERMISSIONS.ADMIN_PLAN_READ,
    PERMISSIONS.ADMIN_ORDER_READ,
    PERMISSIONS.ADMIN_SUBSCRIPTION_READ,
    PERMISSIONS.ADMIN_NODE_READ,
    PERMISSIONS.ADMIN_USER_READ,
    PERMISSIONS.ADMIN_LOG_READ
  ],
  superadmin: [SUPER_ADMIN_PERMISSION]
}

export type BuiltinRole = keyof typeof BUILTIN_ROLES
