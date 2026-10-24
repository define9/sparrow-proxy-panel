import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 图标名静态断言。
 *
 * `i-lucide-<name>` 里的 name 必须存在于已安装的 `@iconify-json/lucide`。
 * 写错不会报错、不会崩，只会让图标**静默消失**（dev server 只 WARN 一句），
 * 因此必须在 CI 里静态拦住。
 */

const PANEL_ROOT = process.cwd()
const ICON_PACKAGE = join(PANEL_ROOT, 'node_modules/@iconify-json/lucide/icons.json')

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

describe('lucide 图标名', () => {
  it('所有 i-lucide-* 都存在于 @iconify-json/lucide', () => {
    const lucide = JSON.parse(readFileSync(ICON_PACKAGE, 'utf8'))
    const valid = new Set(Object.keys(lucide.icons as Record<string, unknown>))
    for (const alias of Object.keys((lucide.aliases ?? {}) as Record<string, string>)) {
      valid.add(alias)
    }

    const files = [
      ...walk(join(PANEL_ROOT, 'app'), '.vue'),
      ...walk(join(PANEL_ROOT, 'app'), '.ts'),
      ...walk(join(PANEL_ROOT, 'server'), '.ts')
    ]

    const missing = new Map<string, Set<string>>()
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/i-lucide-([a-z0-9-]+)/g)) {
        const name = match[1]!
        if (valid.has(name)) {
          continue
        }
        const set = missing.get(name) ?? new Set<string>()
        set.add(file.replace(`${PANEL_ROOT}/`, ''))
        missing.set(name, set)
      }
    }

    const report = [...missing.entries()].map(
      ([name, files]) => `i-lucide-${name} ← ${[...files].join(', ')}`
    )

    expect(report, '以下图标名在 @iconify-json/lucide 中不存在，图标会静默消失').toEqual([])
  })
})
