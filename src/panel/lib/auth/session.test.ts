import { afterEach, describe, expect, it } from 'vitest'
import { cookieSecure } from './session'

/**
 * 会话 cookie 的 Secure 属性：
 *   https → 带 Secure；http → 不带。
 *
 * 曾经的 bug：用 NODE_ENV === 'production' 硬判，纯 HTTP 部署（内网 / IPv6 直连 /
 * 无域名）时浏览器拒收带 Secure 的 cookie → 登录后立刻跳回登录页，极难排查。
 */

const originalSiteUrl = process.env.SITE_URL
const originalNextPublic = process.env.NEXT_PUBLIC_SITE_URL
const originalCookieSecure = process.env.COOKIE_SECURE

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.SITE_URL
  else process.env.SITE_URL = originalSiteUrl
  if (originalNextPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = originalNextPublic
  if (originalCookieSecure === undefined) delete process.env.COOKIE_SECURE
  else process.env.COOKIE_SECURE = originalCookieSecure
})

describe('cookieSecure', () => {
  it('https 站点 → 带 Secure', () => {
    process.env.SITE_URL = 'https://panel.example.com'
    expect(cookieSecure()).toBe(true)
  })

  it('http 站点 → 不带 Secure（否则纯 HTTP 部署永远登不上）', () => {
    process.env.SITE_URL = 'http://[240e::1]:8080'
    expect(cookieSecure()).toBe(false)
  })

  it('没配站点地址 → 不带 Secure（宁可少一层保护，也不能登不上）', () => {
    delete process.env.SITE_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(cookieSecure()).toBe(false)
  })

  it('显式 COOKIE_SECURE=1 强制开', () => {
    process.env.SITE_URL = 'http://panel.example.com'
    process.env.COOKIE_SECURE = '1'
    expect(cookieSecure()).toBe(true)
  })

  it('显式 COOKIE_SECURE=0 强制关', () => {
    process.env.SITE_URL = 'https://panel.example.com'
    process.env.COOKIE_SECURE = '0'
    expect(cookieSecure()).toBe(false)
  })

  it('大小写与空格不敏感', () => {
    process.env.SITE_URL = 'http://panel.example.com'
    process.env.COOKIE_SECURE = ' TRUE '
    expect(cookieSecure()).toBe(true)
  })
})
