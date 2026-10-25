import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

/**
 * 消息编译断言。
 *
 * vue-i18n 的消息编译器有自己的语法：
 * - `{name}` 是插值占位符
 * - 字面花括号必须写成 `{'{'}` / `{'}'}`
 *
 * 一旦某个 locale 文件里有非法占位符（如 JSON 示例 `{ "key": "x" }`），
 * **整个文件的 messages 都会编译失败** → 该 locale 变成空消息 → 页面全显示裸 key。
 * 而且失败只表现为一条 dev server WARN，很容易被忽略。
 *
 * 这里用 vue-i18n 自己的编译器逐条编译，确保没有非法语法。
 */

const PANEL_ROOT = process.cwd()
const LOCALES_DIR = join(PANEL_ROOT, 'i18n/locales')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (full.endsWith('.json')) {
      out.push(full)
    }
  }
  return out
}

/** 把嵌套对象拍平成 { 'a.b.c': '值' } */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, path))
    } else {
      out[path] = String(value)
    }
  }
  return out
}

describe('vue-i18n 消息编译', () => {
  it('所有 locale 文件的所有消息都能被 vue-i18n 编译', () => {
    const errors: string[] = []

    for (const file of walk(LOCALES_DIR)) {
      const short = file.replace(`${PANEL_ROOT}/`, '')
      const data = JSON.parse(readFileSync(file, 'utf8'))
      const messages = flatten(data)

      // 每个 locale 独立编译：任何一个文件失败都不应影响其他
      const i18n = createI18n({
        legacy: false,
        locale: 'test',
        messages: { test: messages },
        // 关闭告警噪音，只看真正的编译错误
        missingWarn: false,
        fallbackWarn: false,
        warnHtmlMessage: false
      })

      for (const [key, value] of Object.entries(messages)) {
        try {
          const result = i18n.global.t(key)
          if (result === key) {
            errors.push(`${short} · ${key} → 编译后仍是 key（疑似非法占位符）: ${value.slice(0, 80)}`)
          }
        } catch (error) {
          errors.push(`${short} · ${key} → ${(error as Error).message}`)
        }
      }
    }

    expect(
      errors,
      '以下消息无法被 vue-i18n 编译（字面花括号需写成 {\'{\'} / {\'}\'）'
    ).toEqual([])
  })

  it('manifestPlaceholder 这类含 JSON 的文案能正常编译', () => {
    const zh = JSON.parse(readFileSync(join(LOCALES_DIR, 'plugins.zh-CN.json'), 'utf8'))
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': flatten(zh) },
      missingWarn: false,
      fallbackWarn: false
    })

    const out = i18n.global.t('plugins.list.manifestPlaceholder') as string
    expect(out).not.toBe('plugins.list.manifestPlaceholder')
    expect(out).toContain('demo-notifier')
  })
})
