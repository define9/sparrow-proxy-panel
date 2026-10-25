import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `USelect` / `USelectMenu` 的 item value 断言。
 *
 * Reka UI（Nuxt UI v4 底层）规定：item 的 value **不能是空字符串**，
 * 因为空串是"清除选择并显示占位符"的保留值：
 *
 *   A <SelectItem /> must have a value prop that is not an empty string.
 *
 * 这个错误只在运行时、且只在选中该 item 时才抛，很难在开发中定位，
 * 因此这里做静态检查。
 *
 * 检查两类来源：
 * 1. 字面量对象：{ label: '...', value: '' }
 * 2. 变量声明：const x = [{ label: '...', value: '' }]
 */

const PANEL_ROOT = process.cwd()
const APP_DIR = join(PANEL_ROOT, 'app')

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, ext, out)
    } else if (full.endsWith(ext)) {
      out.push(full)
    }
  }
  return out
}

describe('USelect items', () => {
  it('没有使用空字符串作为 item 的 value', () => {
    const offenders: string[] = []

    for (const file of [...walk(APP_DIR, '.vue'), ...walk(APP_DIR, '.ts')]) {
      const source = readFileSync(file, 'utf8')
      const lines = source.split('\n')

      lines.forEach((line, index) => {
        // 只检查形如 { ... value: '' ... } 的对象字面量
        if (!/value:\s*(''|"")/.test(line)) {
          return
        }
        // 排除非 items 的场景：v-model 绑定、props 默认值等
        const isItemLiteral = /\{\s*label:|label:/.test(line) || /^\s*value:\s*(''|"")\s*[,}]/.test(line)
        if (!isItemLiteral) {
          return
        }
        // 排除 :value="" 这类属性绑定（那是 v-model，不是 item）
        if (/^[^:]*:value=/.test(line)) {
          return
        }
        offenders.push(`${relative(PANEL_ROOT, file)}:${index + 1}  ${line.trim()}`)
      })
    }

    expect(
      offenders,
      '以下地方把空字符串当作 item 的 value（Reka UI 会抛错）'
    ).toEqual([])
  })

  it('filters.ts 提供了 ALL_FILTER 哨兵值', () => {
    const source = readFileSync(join(APP_DIR, 'utils/filters.ts'), 'utf8')
    expect(source).toContain('export const ALL_FILTER')
    expect(source).toContain('export function toFilterParam')
  })
})
