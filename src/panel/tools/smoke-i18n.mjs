#!/usr/bin/env node
/**
 * i18n 冒烟检查：构建产物起服务，逐页访问并检查是否出现「裸 key」。
 *
 * 用法：
 *   node tools/smoke-i18n.mjs            # 需要先 pnpm build
 *
 * 目的：把「页面显示 nav.login 这种裸 key」变成 CI 里可失败的错误，
 * 而不是等用户截图才发现。
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = process.env.SMOKE_PORT ?? '3099'
const BASE = `http://127.0.0.1:${PORT}`

const PAGES = [
  '/',
  '/login',
  '/dashboard',
  '/dashboard/plans',
  '/dashboard/orders',
  '/dashboard/subscriptions',
  '/dashboard/traffic',
  '/dashboard/settings',
  '/admin',
  '/admin/plans',
  '/admin/orders',
  '/admin/subscriptions',
  '/admin/nodes',
  '/admin/nodes/groups',
  '/admin/nodes/certificates',
  '/admin/users',
  '/admin/plugins',
  '/admin/plugin-sources',
  '/admin/logs',
  '/admin/coupons',
  '/admin/settings'
]

/** 已知的一级命名空间（用于识别裸 key） */
const NAMESPACES = [
  'nav', 'common', 'auth', 'action', 'home', 'dashboard', 'plans', 'orders',
  'subscriptions', 'nodes', 'plugins', 'site', 'field', 'order', 'node', 'plugin', 'log'
]

const BARE_KEY_RE = new RegExp(`>([a-z][a-zA-Z]*(?:\\.[a-zA-Z][a-zA-Z]*)+)<`, 'g')

function findBareKeys(html) {
  const hits = new Set()
  for (const match of html.matchAll(BARE_KEY_RE)) {
    const key = match[1]
    if (NAMESPACES.includes(key.split('.')[0])) {
      hits.add(key)
    }
  }
  return [...hits]
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { redirect: 'manual' })
      if (res.status < 500) {
        return true
      }
    } catch {
      // 服务还没起来，继续等待
    }
    await sleep(500)
  }
  return false
}

const server = spawn('node', ['.output/server/index.mjs'], {
  env: { ...process.env, PORT, NITRO_PORT: PORT },
  stdio: 'ignore'
})

let failed = false
try {
  if (!await waitForServer()) {
    console.error('✖ 服务未能在 30s 内启动')
    process.exit(1)
  }

  // 登录（用种子脚本的默认管理员），以便检查受保护页面的 i18n
  let cookie = ''
  const email = process.env.SMOKE_EMAIL
  const password = process.env.SMOKE_PASSWORD
  if (email && password) {
    const login = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    cookie = (login.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
    console.log(cookie ? '✔ 已登录，开始检查受保护页面' : '⚠ 登录失败，受保护页面将被跳过')
  } else {
    console.log('⚠ 未提供 SMOKE_EMAIL / SMOKE_PASSWORD，跳过受保护页面')
  }

  for (const page of PAGES) {
    const res = await fetch(`${BASE}${page}`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {}
    })
    const html = res.status >= 300 && res.status < 400 ? '' : await res.text()
    const bare = findBareKeys(html)

    if (bare.length > 0) {
      failed = true
      console.error(`✖ ${page} 出现裸 key：${bare.join(', ')}`)
    } else {
      console.log(`✔ ${page} (${res.status})`)
    }
  }
} finally {
  server.kill('SIGTERM')
}

if (failed) {
  console.error('\n✖ 存在裸 key，请检查 i18n locale 注册与 key 定义')
  process.exit(1)
}
console.log('\n✔ 所有页面 i18n 正常')
