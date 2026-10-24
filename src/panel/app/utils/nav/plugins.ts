import { PERMISSIONS } from '@sparrow/contracts/permissions'
import type { NavEntry } from '~/utils/navigation'

/**
 * 插件相关菜单片段。
 *
 * `app/utils/navigation.ts` 的 adminNav 已经内联了同样的两项，
 * 但该文件本次不可修改，因此这里单独导出，供协调者合并 / 复用：
 *
 * ```ts
 * import { pluginNavGroup } from '~/utils/nav/plugins'
 *
 * export const adminNav: NavEntry[] = [
 *   ...
 *   pluginNavGroup
 * ]
 * ```
 */
export const pluginNavEntries: NavEntry[] = [
  { labelKey: 'nav.pluginList', icon: 'i-lucide-list', to: '/admin/plugins' },
  { labelKey: 'nav.pluginSources', icon: 'i-lucide-cloud-download', to: '/admin/plugin-sources' }
]

/** 插件菜单分组（含子项） */
export const pluginNavGroup: NavEntry = {
  labelKey: 'nav.plugins',
  icon: 'i-lucide-plug',
  permission: PERMISSIONS.ADMIN_PLUGIN_READ,
  children: pluginNavEntries
}
