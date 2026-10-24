import type { NavigationMenuItem } from '@nuxt/ui'
import { PERMISSIONS } from '@sparrow/contracts/permissions'

/**
 * 菜单模型。
 *
 * 菜单是数据而不是模板：路由、权限点、i18n key 三者绑定在一起，
 * 后端用同一套权限点字符串做校验（server/utils/auth.ts 的 requirePermission）。
 */
export interface NavEntry {
  /** i18n key，如 'nav.plans' */
  labelKey: string
  /** i-lucide-* 图标 */
  icon: string
  /** 路由路径 */
  to?: string
  /** 需要的权限点，无则所有人可见 */
  permission?: string
  /** 徽标文案（如未读数量） */
  badge?: string | number
  /** 子项 */
  children?: NavEntry[]
  /** 精确匹配（避免 /admin 命中 /admin/nodes） */
  exact?: boolean
}

export const userNav: NavEntry[] = [
  { labelKey: 'nav.dashboard', icon: 'i-lucide-gauge', to: '/dashboard' },
  { labelKey: 'nav.plans', icon: 'i-lucide-package', to: '/dashboard/plans' },
  { labelKey: 'nav.orders', icon: 'i-lucide-receipt', to: '/dashboard/orders' },
  { labelKey: 'nav.subscriptions', icon: 'i-lucide-rss', to: '/dashboard/subscriptions' },
  { labelKey: 'nav.traffic', icon: 'i-lucide-chart-line', to: '/dashboard/traffic' },
  { labelKey: 'nav.settings', icon: 'i-lucide-settings', to: '/dashboard/settings' }
]

export const adminNav: NavEntry[] = [
  { labelKey: 'nav.dashboard', icon: 'i-lucide-gauge', to: '/admin' },
  { labelKey: 'nav.plans', icon: 'i-lucide-package', to: '/admin/plans', permission: PERMISSIONS.ADMIN_PLAN_READ },
  { labelKey: 'nav.orders', icon: 'i-lucide-receipt', to: '/admin/orders', permission: PERMISSIONS.ADMIN_ORDER_READ },
  { labelKey: 'nav.subscriptions', icon: 'i-lucide-rss', to: '/admin/subscriptions', permission: PERMISSIONS.ADMIN_SUBSCRIPTION_READ },
  {
    labelKey: 'nav.nodes',
    icon: 'i-lucide-server',
    permission: PERMISSIONS.ADMIN_NODE_READ,
    children: [
      { labelKey: 'nav.nodeList', icon: 'i-lucide-list', to: '/admin/nodes' },
      { labelKey: 'nav.nodeGroups', icon: 'i-lucide-folder-tree', to: '/admin/nodes/groups' },
      { labelKey: 'nav.certificates', icon: 'i-lucide-shield-check', to: '/admin/nodes/certificates' }
    ]
  },
  { labelKey: 'nav.users', icon: 'i-lucide-users', to: '/admin/users', permission: PERMISSIONS.ADMIN_USER_READ },
  {
    labelKey: 'nav.plugins',
    icon: 'i-lucide-plug',
    permission: PERMISSIONS.ADMIN_PLUGIN_READ,
    children: [
      { labelKey: 'nav.pluginList', icon: 'i-lucide-list', to: '/admin/plugins' },
      { labelKey: 'nav.pluginSources', icon: 'i-lucide-cloud-download', to: '/admin/plugin-sources' }
    ]
  },
  { labelKey: 'nav.logs', icon: 'i-lucide-scroll-text', to: '/admin/logs', permission: PERMISSIONS.ADMIN_LOG_READ },
  { labelKey: 'nav.coupons', icon: 'i-lucide-ticket-percent', to: '/admin/coupons', permission: PERMISSIONS.ADMIN_COUPON_READ },
  { labelKey: 'nav.settings', icon: 'i-lucide-settings', to: '/admin/settings', permission: PERMISSIONS.ADMIN_SETTINGS_READ }
]

/** 按权限过滤菜单树：自身无权限则整支子树移除 */
export function filterNav(entries: NavEntry[], can: (permission?: string) => boolean): NavEntry[] {
  return entries.reduce<NavEntry[]>((acc, entry) => {
    if (entry.permission && !can(entry.permission)) {
      return acc
    }

    if (entry.children?.length) {
      const children = filterNav(entry.children, can)
      if (children.length === 0) {
        return acc
      }
      acc.push({ ...entry, children })
      return acc
    }

    acc.push(entry)
    return acc
  }, [])
}

/** 转成 Nuxt UI 的 NavigationMenuItem（供 UNavigationMenu 使用） */
export function toNavigationItems(entries: NavEntry[], t: (key: string) => string): NavigationMenuItem[] {
  return entries.map((entry) => {
    const item: NavigationMenuItem = {
      label: t(entry.labelKey),
      icon: entry.icon,
      ...(entry.badge !== undefined ? { badge: String(entry.badge) } : {}),
      ...(entry.exact ? { exact: true } : {})
    }

    if (entry.children?.length) {
      item.type = 'trigger'
      item.defaultOpen = true
      item.children = toNavigationItems(entry.children, t)
    } else if (entry.to) {
      item.to = entry.to
    }

    return item
  })
}
