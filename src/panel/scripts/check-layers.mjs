#!/usr/bin/env node
/**
 * 分层检查：route → service → db 的单向依赖。
 * 规则见 docs/architecture/backend-layers.md §8。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const errors = []
const warnings = []

const DB_IMPORT = /from\s+['"]@\/lib\/db['"]/
const DB_CALL = /\bdb\.(select|insert|update|delete|execute|transaction|query)\b/
const SERVER_ONLY = /import\s+['"]server-only['"]/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function rel(file) {
  return relative(root, file)
}

const files = walk(join(root, 'app/api'))
  .filter((file) => file.endsWith('/route.ts'))

let routeCount = 0

for (const file of files) {
  routeCount += 1
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n').length

  if (DB_IMPORT.test(source) || DB_CALL.test(source)) {
    errors.push(`${rel(file)} 直接访问数据库，业务逻辑应下沉到 lib/services/`)
  }

  if (lines > 120) {
    errors.push(`${rel(file)} 有 ${lines} 行，route 应保持在 40 行左右（上限 120）`)
  } else if (lines > 80) {
    warnings.push(`${rel(file)} 有 ${lines} 行，建议拆到 service`)
  }
}

const serviceDir = join(root, 'lib/services')
for (const file of walk(serviceDir)) {
  if (!file.endsWith('.ts')) continue
  const source = readFileSync(file, 'utf8')
  if (!SERVER_ONLY.test(source)) {
    warnings.push(`${rel(file)} 缺少 import 'server-only'`)
  }
}

for (const dir of ['lib/labels']) {
  try {
    for (const file of walk(join(root, dir))) {
      if (!file.endsWith('.ts')) continue
      if (DB_IMPORT.test(readFileSync(file, 'utf8'))) {
        errors.push(`${rel(file)} 展示层不应访问数据库`)
      }
    }
  } catch {
    // 目录还没建，忽略
  }
}

const tsxPages = walk(join(root, 'app')).filter(
  (file) => file.endsWith('.tsx') && !file.includes('/api/')
)
let pageDirectDb = 0
for (const file of tsxPages) {
  if (DB_IMPORT.test(readFileSync(file, 'utf8'))) pageDirectDb += 1
}

console.log(`分层检查：${routeCount} 个 route handler，${tsxPages.length} 个页面组件`)
if (pageDirectDb > 0) {
  warnings.push(`${pageDirectDb} 个页面直接 import @/lib/db（RSC 取数建议走 service）`)
}

for (const w of warnings) console.log(`  ⚠ ${w}`)
for (const e of errors) console.log(`  ✗ ${e}`)

if (errors.length > 0) {
  console.error(`\n分层检查失败：${errors.length} 个错误，${warnings.length} 个警告`)
  process.exit(1)
}

console.log(`✓ 分层检查通过（${warnings.length} 个警告）`)
