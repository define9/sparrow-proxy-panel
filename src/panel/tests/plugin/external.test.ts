import { describe, expect, it, vi } from 'vitest'
import {
  buildHookUrl,
  callExternalHook,
  resolvePluginEndpoint,
  resolvePluginToken,
  signPayload
} from '../../server/utils/plugin-host/external'
import type { PluginManifest } from '@sparrow/contracts'

/**
 * 外置插件调用：地址、请求头、超时与失败处理。
 */

const manifest = {
  key: 'ext-plugin',
  name: '外置插件',
  version: '1.0.0',
  type: 'notify'
} as unknown as PluginManifest

function createTarget(overrides: Partial<Parameters<typeof callExternalHook>[0]> = {}) {
  return {
    pluginId: '9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
    pluginKey: 'ext-plugin',
    endpoint: 'http://127.0.0.1:7801',
    token: 'plugin-token',
    hooks: ['notification.send'],
    manifest,
    config: {},
    ...overrides
  }
}

describe('外置插件调用', () => {
  it('拼接 hook 地址', () => {
    expect(buildHookUrl('http://127.0.0.1:7801', 'notification.send'))
      .toBe('http://127.0.0.1:7801/hook/notification.send')
    expect(buildHookUrl('http://127.0.0.1:7801/', 'order.paid'))
      .toBe('http://127.0.0.1:7801/hook/order.paid')
  })

  it('进程地址优先取配置，其次取 manifest.entry', () => {
    expect(resolvePluginEndpoint({ entry: 'https://example.com/plugin.json' }, { endpoint: 'http://127.0.0.1:9000' }))
      .toBe('http://127.0.0.1:9000')
    expect(resolvePluginEndpoint({ entry: 'https://example.com/plugin.json' }, {}))
      .toBe('https://example.com/plugin.json')
    expect(resolvePluginEndpoint({ entry: null }, {})).toBeNull()
  })

  it('token 优先取保留键', () => {
    expect(resolvePluginToken({ __plugin_token: 'a', token: 'b' })).toBe('a')
    expect(resolvePluginToken({ token: 'b' })).toBe('b')
    expect(resolvePluginToken({})).toBeNull()
  })

  it('签名是 token 与请求体的 HMAC-SHA256', () => {
    const signature = signPayload('plugin-token', '{"a":1}')

    expect(signature).toHaveLength(64)
    expect(signature).toBe(signPayload('plugin-token', '{"a":1}'))
    expect(signature).not.toBe(signPayload('other-token', '{"a":1}'))
  })

  it('POST /hook/{hook} 并带上鉴权与插件标识请求头', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ delivered: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    const result = await callExternalHook(createTarget(), 'notification.send', { channel: 'webhook' }, { fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ delivered: true })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:7801/hook/notification.send')
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer plugin-token')
    expect(headers['X-Sparrow-Plugin']).toBe('ext-plugin')
    expect(headers['X-Sparrow-Signature']).toBe(signPayload('plugin-token', JSON.stringify({ channel: 'webhook' })))
  })

  it('插件返回错误状态时不算成功', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))

    const result = await callExternalHook(createTarget(), 'notification.send', {}, { fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toContain('500')
  })

  it('网络异常时返回失败而不是抛出', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection refused')
    })

    const result = await callExternalHook(createTarget(), 'notification.send', {}, { fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('connection refused')
    expect(result.timedOut).toBe(false)
  })

  it('没有配置进程地址时直接失败', async () => {
    const result = await callExternalHook(createTarget({ endpoint: '' }), 'notification.send', {})

    expect(result.ok).toBe(false)
    expect(result.error).toContain('进程地址')
  })
})
