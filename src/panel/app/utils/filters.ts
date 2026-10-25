/**
 * 「全部」筛选项的哨兵值。
 *
 * Reka UI（Nuxt UI v4 的底层）明确规定：`USelect` / `USelectMenu` 的
 * `SelectItem` 不能使用空字符串作为 value —— 空串是"清除选择并显示占位符"
 * 的保留值，用作 item 会抛出：
 *
 *   A <SelectItem /> must have a value prop that is not an empty string.
 *
 * 所以筛选器用 `'all'` 表示"不过滤"，请求参数再映射回 undefined。
 */

/** 全部 / 不过滤 */
export const ALL_FILTER = 'all' as const

export type AllFilter = typeof ALL_FILTER

/**
 * 把筛选值转成请求参数：`'all'` → undefined（不过滤），其余原样。
 */
export function toFilterParam(value: string | undefined | null): string | undefined {
  if (!value || value === ALL_FILTER) {
    return undefined
  }
  return value
}

/**
 * 给筛选器构造选项列表，首项固定为「全部」。
 *
 * @param label  「全部」项的文案
 * @param entries 其他选项 [value, label] 列表
 */
export function withAllFilter<T extends { value: string }>(
  label: string,
  entries: T[]
): (T | { label: string, value: AllFilter })[] {
  return [{ label, value: ALL_FILTER }, ...entries]
}
