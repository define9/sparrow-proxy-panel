import {
  Activity,
  CloudDownload,
  FolderTree,
  Gauge,
  LayoutDashboard,
  List,
  Package,
  Palette,
  Plug,
  Receipt,
  Rss,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Ticket,
  Users
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Localized = { zh: string; en: string }

export interface NavItem {
  label: Localized
  icon: LucideIcon
  href: string
  /** 权限点，缺省表示所有登录用户可见 */
  permission?: string
  items?: NavItem[]
}

export const userNav: NavItem[] = [
  { label: { zh: '概览', en: 'Overview' }, icon: Gauge, href: '/dashboard' },
  { label: { zh: '商品', en: 'Plans' }, icon: Package, href: '/dashboard/plans' },
  { label: { zh: '订单', en: 'Orders' }, icon: Receipt, href: '/dashboard/orders' },
  { label: { zh: '订阅', en: 'Subscriptions' }, icon: Rss, href: '/dashboard/subscriptions' },
  { label: { zh: '流量', en: 'Traffic' }, icon: Activity, href: '/dashboard/traffic' },
  { label: { zh: '设置', en: 'Settings' }, icon: Settings, href: '/dashboard/settings' }
]

export const adminNav: NavItem[] = [
  { label: { zh: '仪表盘', en: 'Dashboard' }, icon: LayoutDashboard, href: '/admin' },
  {
    label: { zh: '商品', en: 'Plans' },
    icon: Package,
    href: '/admin/plans',
    permission: 'admin:plan:read'
  },
  {
    label: { zh: '订单', en: 'Orders' },
    icon: Receipt,
    href: '/admin/orders',
    permission: 'admin:order:read'
  },
  {
    label: { zh: '订阅', en: 'Subscriptions' },
    icon: Rss,
    href: '/admin/subscriptions',
    permission: 'admin:subscription:read'
  },
  {
    label: { zh: '节点', en: 'Nodes' },
    icon: Server,
    href: '/admin/nodes',
    permission: 'admin:node:read',
    items: [
      { label: { zh: '节点列表', en: 'Nodes' }, icon: List, href: '/admin/nodes' },
      { label: { zh: '节点组', en: 'Groups' }, icon: FolderTree, href: '/admin/nodes/groups' },
      { label: { zh: '证书', en: 'Certificates' }, icon: ShieldCheck, href: '/admin/nodes/certificates' }
    ]
  },
  {
    label: { zh: '用户', en: 'Users' },
    icon: Users,
    href: '/admin/users',
    permission: 'admin:user:read'
  },
  {
    label: { zh: '插件', en: 'Plugins' },
    icon: Plug,
    href: '/admin/plugins',
    permission: 'admin:plugin:read',
    items: [
      { label: { zh: '插件列表', en: 'Plugins' }, icon: List, href: '/admin/plugins' },
      { label: { zh: '索引源', en: 'Sources' }, icon: CloudDownload, href: '/admin/plugin-sources' }
    ]
  },
  {
    label: { zh: '优惠券', en: 'Coupons' },
    icon: Ticket,
    href: '/admin/coupons',
    permission: 'admin:coupon:read'
  },
  {
    label: { zh: '日志', en: 'Logs' },
    icon: ScrollText,
    href: '/admin/logs',
    permission: 'admin:log:read'
  },
  {
    label: { zh: '主题', en: 'Themes' },
    icon: Palette,
    href: '/admin/themes',
    permission: 'admin:settings:read'
  },
  {
    label: { zh: '系统设置', en: 'Settings' },
    icon: Settings,
    href: '/admin/settings',
    permission: 'admin:settings:read'
  }
]

export function filterNav(items: NavItem[], granted: readonly string[]): NavItem[] {
  const allowed = (permission?: string) =>
    !permission || granted.includes('*') || granted.includes(permission)

  return items
    .filter((item) => allowed(item.permission))
    .map((item) => ({ ...item, items: item.items ? filterNav(item.items, granted) : undefined }))
}

export function label(item: NavItem, locale: string) {
  return locale === 'en' ? item.label.en : item.label.zh
}
