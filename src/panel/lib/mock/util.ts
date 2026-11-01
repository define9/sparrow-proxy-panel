/** 原型用假数据工具。所有数据都是确定性生成，刷新不变。 */

export function iso(offsetDays: number, offsetHours = 0) {
  const d = new Date('2026-11-01T08:00:00.000Z')
  d.setDate(d.getDate() + offsetDays)
  d.setHours(d.getHours() + offsetHours)
  return d.toISOString()
}

export function mockDelay(ms = 260) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length]
}
