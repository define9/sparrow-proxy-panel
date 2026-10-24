/**
 * 插件相关的展示辅助（状态色 / 图标 / i18n key）。
 *
 * 颜色映射遵循 docs/frontend/design-system.md 的状态色约定：
 * 已安装 → success/subtle，已禁用 → neutral/outline，错误 → error/subtle。
 */

export interface PluginBadgeConf {
  color: 'success' | 'neutral' | 'error' | 'warning' | 'info'
  variant: 'subtle' | 'outline' | 'solid'
}

/** 插件状态 → 徽章样式 */
export function pluginStatusBadge(status: string): PluginBadgeConf {
  switch (status) {
    case 'installed':
      return { color: 'success', variant: 'subtle' }
    case 'disabled':
      return { color: 'neutral', variant: 'outline' }
    case 'error':
      return { color: 'error', variant: 'subtle' }
    default:
      return { color: 'neutral', variant: 'subtle' }
  }
}

/** 三方源同步状态 → 徽章样式 */
export function pluginSyncBadge(status?: string | null): PluginBadgeConf {
  switch (status) {
    case 'success':
      return { color: 'success', variant: 'subtle' }
    case 'failed':
      return { color: 'error', variant: 'subtle' }
    case 'pending':
      return { color: 'warning', variant: 'subtle' }
    default:
      return { color: 'neutral', variant: 'outline' }
  }
}

/** 插件类型 → i18n key */
export function pluginTypeLabelKey(type: string): string {
  return `plugins.type.${type}`
}

/** 插件运行时 → i18n key */
export function pluginRuntimeLabelKey(runtime: string): string {
  return `plugins.runtime.${runtime}`
}

/** 插件来源 → i18n key */
export function pluginSourceLabelKey(sourceType: string): string {
  return `plugins.source.${sourceType}`
}

/** 插件状态 → i18n key */
export function pluginStatusLabelKey(status: string): string {
  return `plugins.status.${status}`
}

/** 插件类型 → 图标 */
export function pluginTypeIcon(type: string): string {
  switch (type) {
    case 'payment':
      return 'i-lucide-credit-card'
    case 'node_source':
      return 'i-lucide-server'
    case 'subscription':
      return 'i-lucide-rss'
    case 'notify':
      return 'i-lucide-bell'
    case 'ui':
      return 'i-lucide-layout-dashboard'
    default:
      return 'i-lucide-plug'
  }
}
