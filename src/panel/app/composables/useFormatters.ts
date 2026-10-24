/**
 * 统一的展示格式化（金额 / 流量 / 时间 / 百分比）。
 *
 * 业务层不直接写 Intl，避免各处口径不一致。
 */
export function useFormatters() {
  const { locale } = useI18n()

  /** 字节 → 人类可读（GB / MB / KB） */
  const bytes = (value: number | null | undefined): string => {
    const size = Number(value ?? 0)
    if (!Number.isFinite(size) || size <= 0) {
      return '0 B'
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
    const scaled = size / 1024 ** index

    return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: index === 0 ? 0 : 2 }).format(scaled)} ${units[index]}`
  }

  /** ISO 时间 → 本地化日期时间 */
  const datetime = (value: string | null | undefined): string => {
    if (!value) {
      return '-'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '-'
    }

    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }

  /** 0~1 → 百分比文本 */
  const percent = (value: number | null | undefined): string => {
    const ratio = Number(value ?? 0)
    if (!Number.isFinite(ratio)) {
      return '0%'
    }

    return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(ratio * 100)}%`
  }

  return { bytes, datetime, percent }
}
