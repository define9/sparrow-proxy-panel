/**
 * 展示层格式化工具。
 *
 * 金额在契约里是字符串（避免浮点误差），展示时统一用 `Intl.NumberFormat`
 * 转成带千分位与两位小数的本地化格式。
 */

/** 当前 locale（拿不到时用运行时默认语言） */
function resolveLocale(): string | undefined {
  try {
    const i18n = useNuxtApp().$i18n as unknown as { locale?: unknown } | undefined
    const locale = i18n?.locale

    if (typeof locale === 'string') {
      return locale
    }
    if (Array.isArray(locale) && typeof locale[0] === 'string') {
      return locale[0]
    }
  } catch {
    // 非 Nuxt 上下文（如单元测试）时回落到运行时默认语言
  }

  return undefined
}

/** 金额格式化：`"19.90"` → `¥19.90` */
export function formatMoney(
  value: string | number | null | undefined,
  currency = 'CNY',
  options: Intl.NumberFormatOptions = {}
): string {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) {
    return String(value)
  }

  try {
    return new Intl.NumberFormat(resolveLocale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** 时间格式化：ISO 字符串 → 本地化日期时间 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat(resolveLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}
