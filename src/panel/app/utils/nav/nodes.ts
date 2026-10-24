import { PERMISSIONS } from '@sparrow/contracts/permissions'
import type { NavEntry } from '../navigation'

/**
 * 节点域菜单片段。
 *
 * 与 `app/utils/navigation.ts` 的 `adminNav` 中的「节点」分组一一对应，
 * 单独拆出来是为了让节点模块可以独立演进（新增子页面时只改这里）。
 *
 * 协调者接入方式（`app/utils/navigation.ts` 属于其他任务的改动范围）：
 *
 * ```ts
 * import { nodeNav } from '~/utils/nav/nodes'
 *
 * export const adminNav: NavEntry[] = [
 *   // ...
 *   {
 *     labelKey: 'nav.nodes',
 *     icon: 'i-lucide-server',
 *     permission: PERMISSIONS.ADMIN_NODE_READ,
 *     children: nodeNav
 *   }
 * ]
 * ```
 *
 * i18n key 复用主 locale 里已有的 `nav.nodeList` / `nav.nodeGroups` / `nav.certificates`。
 */
export const nodeNav: NavEntry[] = [
  {
    labelKey: 'nav.nodeList',
    icon: 'i-lucide-server',
    to: '/admin/nodes',
    permission: PERMISSIONS.ADMIN_NODE_READ
  },
  {
    labelKey: 'nav.nodeGroups',
    icon: 'i-lucide-folder-tree',
    to: '/admin/nodes/groups',
    permission: PERMISSIONS.ADMIN_NODE_READ
  },
  {
    labelKey: 'nav.certificates',
    icon: 'i-lucide-shield-check',
    to: '/admin/nodes/certificates',
    permission: PERMISSIONS.ADMIN_NODE_READ
  }
]

/** 节点分组入口（带子项的父级菜单项） */
export const nodeNavGroup: NavEntry = {
  labelKey: 'nav.nodes',
  icon: 'i-lucide-server',
  permission: PERMISSIONS.ADMIN_NODE_READ,
  children: nodeNav
}
