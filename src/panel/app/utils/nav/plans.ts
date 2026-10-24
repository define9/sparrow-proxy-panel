import { PERMISSIONS } from '@sparrow/contracts/permissions'
import type { NavEntry } from '../navigation'

/**
 * 商品相关菜单片段。
 *
 * `app/utils/navigation.ts` 是共享文件，由协调者统一合并；
 * 这里只提供可独立复用的片段，避免并行改动冲突。
 */

/** 用户端：商品列表 */
export const userPlanNav: NavEntry[] = [
  { labelKey: 'nav.plans', icon: 'i-lucide-package', to: '/dashboard/plans' }
]

/** 管理端：商品管理 */
export const adminPlanNav: NavEntry[] = [
  {
    labelKey: 'nav.plans',
    icon: 'i-lucide-package',
    to: '/admin/plans',
    permission: PERMISSIONS.ADMIN_PLAN_READ
  }
]
