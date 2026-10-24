import { PERMISSIONS } from '@sparrow/contracts/permissions'
import type { NavEntry } from '../navigation'

/**
 * 订单相关菜单片段。
 *
 * `app/utils/navigation.ts` 是共享文件，由协调者统一合并；
 * 这里只提供可独立复用的片段，避免并行改动冲突。
 */

/** 用户端：订单列表 */
export const userOrderNav: NavEntry[] = [
  { labelKey: 'nav.orders', icon: 'i-lucide-receipt', to: '/dashboard/orders' }
]

/** 管理端：订单管理 */
export const adminOrderNav: NavEntry[] = [
  {
    labelKey: 'nav.orders',
    icon: 'i-lucide-receipt',
    to: '/admin/orders',
    permission: PERMISSIONS.ADMIN_ORDER_READ
  }
]
