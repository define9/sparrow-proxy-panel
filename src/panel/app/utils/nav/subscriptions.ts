import type { NavEntry } from '../navigation'

/**
 * 用户端「订阅」菜单片段。
 *
 * app/utils/navigation.ts 是菜单的唯一组装点（该文件不在本任务的可改范围内），
 * 协调者把下面这段合并进 userNav 即可：
 *
 * ```ts
 * import { subscriptionsNav } from './nav/subscriptions'
 * export const userNav: NavEntry[] = [
 *   ...,
 *   ...subscriptionsNav,
 *   ...
 * ]
 * ```
 */
export const subscriptionsNav: NavEntry[] = [
  { labelKey: 'nav.subscriptions', icon: 'i-lucide-rss', to: '/dashboard/subscriptions' }
]
