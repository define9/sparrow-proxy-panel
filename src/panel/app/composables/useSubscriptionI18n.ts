import subscriptionsEn from '../../i18n/locales/subscriptions.en.json'
import subscriptionsZh from '../../i18n/locales/subscriptions.zh-CN.json'

/**
 * 订阅模块的文案兜底。
 *
 * 正式的注册方式是把 `i18n/locales/subscriptions.*.json` 加进 nuxt.config.ts 的
 * `i18n.locales[].files`（nuxt.config.ts 不在本任务的可改范围内，由协调者统一处理）。
 *
 * 这里在运行时把同一份文案合并进当前 locale，保证注册之前页面也能正常显示，
 * 注册之后两者内容一致，不会冲突。
 */
export function useSubscriptionI18n() {
  const { locale, setLocaleMessage } = useI18n()

  const messages = computed(() => (locale.value === 'en' ? subscriptionsEn : subscriptionsZh))

  watch(
    messages,
    (value) => {
      setLocaleMessage(locale.value, { subscriptions: value.subscriptions })
    },
    { immediate: true }
  )
}
