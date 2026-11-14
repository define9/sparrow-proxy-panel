import { afterEach, describe, expect, it } from 'vitest'
import { siteOrigin, siteUrl } from './site-origin'

/**
 * site-origin 的关键行为：
 *   - 客户端（浏览器）用 window.location.origin —— NEXT_PUBLIC_* 在这里被构建期内联，
 *     读它会拿到构建期的 localhost
 *   - 服务端用运行时 SITE_URL（不带 NEXT_PUBLIC_ 前缀 → 不会被内联）
 */

const originalSiteUrl = process.env.SITE_URL
const originalNextPublic = process.env.NEXT_PUBLIC_SITE_URL

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.SITE_URL
  else process.env.SITE_URL = originalSiteUrl
  if (originalNextPublic === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = originalNextPublic
  // 恢复 window（客户端分支用）
  Reflect.deleteProperty(globalThis, 'window')
})

function mockWindow(origin: string) {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin } },
    configurable: true,
    writable: true
  })
}

describe('siteOrigin（服务端）', () => {
  it('优先用运行时 SITE_URL（改环境变量立即生效）', () => {
    process.env.SITE_URL = 'https://panel.example.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
    expect(siteOrigin()).toBe('https://panel.example.com')
  })

  it('去掉结尾斜杠', () => {
    process.env.SITE_URL = 'https://panel.example.com/'
    expect(siteOrigin()).toBe('https://panel.example.com')
  })

  it('SITE_URL 为空时退回 NEXT_PUBLIC_SITE_URL', () => {
    delete process.env.SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'https://fallback.example.com'
    expect(siteOrigin()).toBe('https://fallback.example.com')
  })

  it('两者都没有时用兜底值', () => {
    delete process.env.SITE_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(siteOrigin()).toBe('http://localhost:3000')
  })

  it('IPv6 地址带方括号时原样保留', () => {
    process.env.SITE_URL = 'http://[240e::1]:8080'
    expect(siteOrigin()).toBe('http://[240e::1]:8080')
  })
})

describe('siteOrigin（客户端）', () => {
  it('用浏览器当前 origin，不受环境变量影响', () => {
    process.env.SITE_URL = 'https://wrong.example.com'
    mockWindow('https://right.example.com')
    expect(siteOrigin()).toBe('https://right.example.com')
  })

  it('IPv6 的 origin 自带方括号', () => {
    mockWindow('http://[240e::1]:8080')
    expect(siteOrigin()).toBe('http://[240e::1]:8080')
  })

  it('window.location.origin 为 "null"（file:// 等）时退回服务端逻辑', () => {
    process.env.SITE_URL = 'https://panel.example.com'
    mockWindow('null')
    expect(siteOrigin()).toBe('https://panel.example.com')
  })
})

describe('siteUrl', () => {
  it('补上开头的斜杠', () => {
    process.env.SITE_URL = 'https://panel.example.com'
    expect(siteUrl('sub/abc')).toBe('https://panel.example.com/sub/abc')
    expect(siteUrl('/sub/abc')).toBe('https://panel.example.com/sub/abc')
  })

  it('客户端用浏览器 origin 拼', () => {
    mockWindow('https://right.example.com')
    expect(siteUrl('/sub/abc')).toBe('https://right.example.com/sub/abc')
  })
})
