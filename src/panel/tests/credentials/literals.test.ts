import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 凭据字面量断言。
 *
 * 背景：脱敏/模板渲染可能把 `admin@example.com` 之类的凭据写成了
 * `{{EMAIL_xxx}}` / `{{SECRET_xxx}}` 占位符字面量，
 * 而这些占位符**会被当成真实值写进数据库**，导致"文档写的账号登不上"。
 *
 * 这里断言：源码里出现的凭据占位符必须来自环境变量，而不是硬编码。
 */

const PANEL_ROOT = process.cwd()

const FILES = [
  'drizzle/seed.ts',
  '.env.example',
  '../.github/workflows/ci.yml',
  '../README.md'
]

const PLACEHOLDER_RE = /\{\{(EMAIL|SECRET|PASSWORD)_[a-z0-9]+\}\}/gi

describe('凭据字面量', () => {
  it('seed 脚本不硬编码占位符形式的邮箱/密码', () => {
    const source = readFileSync(join(PANEL_ROOT, 'drizzle/seed.ts'), 'utf8')

    // 允许出现在注释里的说明性占位符
    const code = source
      .split('\n')
      .filter(line => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n')

    const hits = code.match(PLACEHOLDER_RE)
    expect(
      hits,
      'seed 脚本里出现了占位符凭据（会被当成真实值写进数据库）'
    ).toBeNull()
  })

  it('seed 脚本支持用环境变量覆盖账号', () => {
    const source = readFileSync(join(PANEL_ROOT, 'drizzle/seed.ts'), 'utf8')
    expect(source).toContain('process.env.ADMIN_EMAIL')
    expect(source).toContain('process.env.ADMIN_PASSWORD')
  })

  it('默认邮箱是常见的 admin@example.com', () => {
    const source = readFileSync(join(PANEL_ROOT, 'drizzle/seed.ts'), 'utf8')
    expect(source).toContain("'admin@example.com'")
  })
})
