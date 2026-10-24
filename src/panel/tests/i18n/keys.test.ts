import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * i18n 静态断言。
 *
 * 防止两类线上事故：
 * 1. 组件里用了 `t('xxx')`，但 locale 文件里没有这个 key → 页面直接显示裸 key
 * 2. zh-CN 与 en 的 key 集合不一致 → 切到英文时出现裸 key
 *
 * 用法：pnpm test（vitest）
 */

const PANEL_ROOT = join(process.cwd())
const LOCALES_DIR = join(PANEL_ROOT, 'i18n/locales')
const APP_DIR = join(PANEL_ROOT, 'app')

/** 递归收集目录下所有文件 */
function walk(dir: string, ext: string): string[] {
  if (!existsDir(dir)) {
    return []
  }
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, ext))
    } else if (full.endsWith(ext)) {
      out.push(full)
    }
  }
  return out
}

function existsDir(dir: string): boolean {
  try {
    return statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/** 把嵌套对象拍平成 `a.b.c` 形式的 key 集合 */
function flatten(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of flatten(value as Record<string, unknown>, path)) {
        keys.add(nested)
      }
    } else {
      keys.add(path)
    }
  }
  return keys
}

/** 合并某个 locale 的所有分片文件（zh-CN.json + plugins.zh-CN.json + ...） */
function mergeLocale(prefix: string): Record<string, unknown> {
  const files = readdirSync(LOCALES_DIR)
    .filter(name => name === `${prefix}.json` || name.endsWith(`.${prefix}.json`))
    .sort()

  const merged: Record<string, unknown> = {}
  for (const name of files) {
    deepMerge(merged, JSON.parse(readFileSync(join(LOCALES_DIR, name), 'utf8')))
  }
  return merged
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const current = target[key]
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        deepMerge(current as Record<string, unknown>, value as Record<string, unknown>)
      } else {
        target[key] = value
      }
    } else {
      target[key] = value
    }
  }
}

/** 从源码里抽出所有 `t('key')` / `t("key")` 形式的字面量 key */
function extractUsedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const pattern = /\b(?:\$?t)\(\s*['"]([\w.-]+)['"]/g

  for (const file of walk(APP_DIR, '.vue').concat(walk(APP_DIR, '.ts'))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(pattern)) {
      const key = match[1]!
      const list = used.get(key) ?? []
      list.push(relative(PANEL_ROOT, file))
      used.set(key, list)
    }
  }

  return used
}

describe('i18n locale 文件', () => {
  it('zh-CN 与 en 的 key 集合一致', () => {
    const zh = flatten(mergeLocale('zh-CN'))
    const en = flatten(mergeLocale('en'))

    const missingInEn = [...zh].filter(key => !en.has(key))
    const missingInZh = [...en].filter(key => !zh.has(key))

    expect(
      { missingInEn, missingInZh },
      'zh-CN 与 en 的 key 不一致'
    ).toEqual({ missingInEn: [], missingInZh: [] })
  })

  it('组件里用到的 key 都能在 zh-CN 中找到', () => {
    const zh = flatten(mergeLocale('zh-CN'))
    const used = extractUsedKeys()

    const missing = [...used.entries()]
      .filter(([key]) => !zh.has(key))
      .map(([key, files]) => `${key}  ← ${[...new Set(files)].join(', ')}`)

    expect(missing, '以下 key 未在 i18n/locales/zh-CN*.json 中定义，页面会显示裸 key').toEqual([])
  })

  it('zh-CN 的值不是空字符串', () => {
    const zh = flatten(mergeLocale('zh-CN'))
    expect(zh.size).toBeGreaterThan(0)
  })
})
