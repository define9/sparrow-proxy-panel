/** 金额：字符串 → 本地化货币 */
export function formatMoney(value: string | number, currency = 'CNY') {
  const n = typeof value === 'string' ? Number(value) : value
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(n)
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/** 字节 → 人读流量 */
export function formatBytes(bytes: number, digits = 2) {
  if (!bytes) return '0 B'
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : digits)} ${UNITS[i]}`
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso))
}

export function formatDay(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(iso))
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.round(min / 60)
  if (hour < 24) return `${hour} 小时前`
  return `${Math.round(hour / 24)} 天前`
}

export function percent(used: number, total: number) {
  if (!total) return 0
  return Math.min(100, Math.round((used / total) * 100))
}

/** 剩余天数（负数表示已过期） */
export function daysLeft(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}
