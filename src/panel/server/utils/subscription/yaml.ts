/**
 * 极简 YAML 序列化器（无第三方依赖）。
 *
 * 只支持渲染器需要的子集：对象 / 数组 / 标量（字符串、数字、布尔、null）。
 * 字符串按 YAML 双引号风格转义（与 JSON 字符串兼容），保证节点名、
 * 密码、SNI 等任意内容都不会破坏 YAML 结构。
 */

/** 标量类型 */
export type YamlScalar = string | number | boolean | null | undefined

/** 可序列化的值 */
export type YamlValue = YamlScalar | YamlValue[] | { [key: string]: YamlValue }

const YAML_KEYWORDS = new Set([
  'true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n', '~'
])

/** YAML 指示符（不能作为纯量开头） */
const LEADING_INDICATORS = '-?:,[]{}#&*!|>\'"%@`'

/** 纯量里出现就加引号的字符（保守处理，避免各解析器行为不一致） */
const UNSAFE_CHARS = [',', '[', ']', '{', '}']

function hasUnsafeChars(value: string): boolean {
  return UNSAFE_CHARS.some(char => value.includes(char))
}

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

function isPlainObject(value: YamlValue): value is { [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isComposite(value: YamlValue): value is YamlValue[] | { [key: string]: YamlValue } {
  return Array.isArray(value) || isPlainObject(value)
}

/** 空集合要写成 `[]` / `{}`，否则 YAML 会解析成 null */
function emptyLiteral(value: YamlValue): string | null {
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : null
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length === 0 ? '{}' : null
  }
  return null
}

/** 需要加引号的字符串：空串、YAML 关键字、纯数字、带特殊字符 */
function needsQuotes(value: string): boolean {
  if (value === '') {
    return true
  }
  if (YAML_KEYWORDS.has(value.toLowerCase())) {
    return true
  }
  if (/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(value)) {
    return true
  }
  if (value !== value.trim()) {
    return true
  }
  if (LEADING_INDICATORS.includes(value[0]!)) {
    return true
  }
  if (hasUnsafeChars(value)) {
    return true
  }
  if (/:\s/.test(value) || value.includes(' #')) {
    return true
  }
  if (hasControlChars(value)) {
    return true
  }
  return false
}

/** 标量 → YAML 文本 */
export function formatScalar(value: string | number | boolean | null): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null'
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return needsQuotes(value) ? JSON.stringify(value) : value
}

/** 键名 → YAML 文本 */
export function formatKey(key: string): string {
  return needsQuotes(key) ? JSON.stringify(key) : key
}

function emitNode(value: YamlValue, indent: number, lines: string[]): void {
  const pad = ' '.repeat(indent)

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === undefined) {
        continue
      }

      if (isPlainObject(item)) {
        const entries = Object.entries(item).filter(([, child]) => child !== undefined)
        if (entries.length === 0) {
          lines.push(`${pad}- {}`)
          continue
        }

        entries.forEach(([key, child], index) => {
          // 数组项的首个键跟在 "- " 后面，其余键对齐到同一列
          const prefix = index === 0 ? `${pad}- ` : `${pad}  `
          const empty = emptyLiteral(child)
          if (empty !== null) {
            lines.push(`${prefix}${formatKey(key)}: ${empty}`)
          } else if (isComposite(child)) {
            lines.push(`${prefix}${formatKey(key)}:`)
            emitNode(child, indent + 4, lines)
          } else {
            lines.push(`${prefix}${formatKey(key)}: ${formatScalar(child as string | number | boolean | null)}`)
          }
        })
        continue
      }

      if (Array.isArray(item)) {
        lines.push(`${pad}-`)
        emitNode(item, indent + 2, lines)
        continue
      }

      lines.push(`${pad}- ${formatScalar(item)}`)
    }
    return
  }

  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) {
        continue
      }

      const empty = emptyLiteral(child)
      if (empty !== null) {
        lines.push(`${pad}${formatKey(key)}: ${empty}`)
      } else if (isComposite(child)) {
        lines.push(`${pad}${formatKey(key)}:`)
        emitNode(child, indent + 2, lines)
      } else {
        lines.push(`${pad}${formatKey(key)}: ${formatScalar(child)}`)
      }
    }
  }
}

/**
 * 序列化为 YAML 文本（以换行结尾）。
 */
export function stringifyYaml(value: YamlValue): string {
  const lines: string[] = []
  emitNode(value, 0, lines)
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}
