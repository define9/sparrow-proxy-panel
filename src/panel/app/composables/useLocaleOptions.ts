/**
 * 把 @nuxtjs/i18n 的语言列表转换成 Nuxt UI `ULocaleSelect` 需要的结构。
 *
 * Nuxt UI 的 Locale 类型为 { name, code, dir, messages }，
 * 而 vue-i18n 的 LocaleObject 结构不同，直接传入会有类型不匹配。
 */
export interface UiLocaleOption {
  code: string
  name: string
  dir: 'ltr' | 'rtl'
  messages: Record<string, unknown>
}

export function useLocaleOptions() {
  const { locales } = useI18n()

  return computed<UiLocaleOption[]>(() => locales.value.map(locale => ({
    code: locale.code,
    name: locale.name ?? locale.code,
    dir: (locale.dir ?? 'ltr') as 'ltr' | 'rtl',
    messages: {}
  })))
}
