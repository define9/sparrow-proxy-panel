import nodesEn from '../../i18n/locales/nodes.en.json'
import nodesZh from '../../i18n/locales/nodes.zh-CN.json'

/**
 * 节点域的 i18n 消息。
 *
 * `i18n/locales/nodes.*.json` 属于**按业务域拆分**的 locale 文件，
 * 需要在 `nuxt.config.ts` 的 `i18n.locales[].files` 里注册才会被打包：
 *
 * ```ts
 * locales: [
 *   { code: 'zh-CN', language: 'zh-CN', name: '简体中文', files: ['nodes.zh-CN.json', 'zh-CN.json'] },
 *   { code: 'en', language: 'en', name: 'English', files: ['nodes.en.json', 'en.json'] }
 * ]
 * ```
 *
 * 在注册之前，本插件先把 `nodes.*` 命名空间合并进当前 locale，
 * 保证节点相关页面不会出现裸 key。**注册之后本插件会自动跳过**
 * （检测到 `nodes` 命名空间已存在就不再合并）。
 */
export default defineNuxtPlugin((nuxtApp) => {
  const i18n = nuxtApp.$i18n as unknown as {
    mergeLocaleMessage: (locale: string, message: Record<string, unknown>) => void
    getLocaleMessage?: (locale: string) => Record<string, unknown>
  }

  const bundles: Record<string, { nodes: unknown }> = {
    'zh-CN': nodesZh,
    'en': nodesEn
  }

  for (const [locale, bundle] of Object.entries(bundles)) {
    const existing = i18n.getLocaleMessage?.(locale)
    if (existing && existing.nodes) {
      continue
    }
    i18n.mergeLocaleMessage(locale, bundle)
  }
})
