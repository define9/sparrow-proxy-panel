import { describe, expect, it } from 'vitest'
import {
  parsePluginManifest,
  PluginManifestError,
  validatePluginManifest
} from '../../server/utils/plugin-host/manifest'

/**
 * 插件清单校验（契约 packages/contracts/src/domain/plugin.ts）。
 */

const validManifest = {
  key: 'demo-notifier',
  name: '示例通知插件',
  version: '1.0.0',
  type: 'notify',
  description: '演示插件',
  author: 'sparrow',
  runtime: 'builtin',
  permissions: ['order:read'],
  hooks: ['notification.send'],
  configSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        title: '通知渠道',
        default: 'webhook',
        enum: ['webhook', 'email'],
        required: true
      },
      token: { type: 'string', title: '密钥', secret: true }
    },
    required: ['channel']
  }
}

describe('插件清单校验', () => {
  it('接受合法清单', () => {
    const result = parsePluginManifest(validManifest)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.manifest.key).toBe('demo-notifier')
      expect(result.manifest.runtime).toBe('builtin')
      expect(result.manifest.hooks).toEqual(['notification.send'])
      expect(result.manifest.permissions).toEqual(['order:read'])
    }
  })

  it('缺省字段走契约默认值', () => {
    const manifest = validatePluginManifest({
      key: 'demo-hook',
      name: '示例扩展点插件',
      version: '1.0.0',
      type: 'hook'
    })

    expect(manifest.runtime).toBe('external')
    expect(manifest.permissions).toEqual([])
    expect(manifest.hooks).toEqual([])
    expect(manifest.configSchema).toEqual({})
  })

  it('缺少 key 时报错', () => {
    const result = parsePluginManifest({
      name: '缺少 key',
      version: '1.0.0',
      type: 'notify'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some(issue => issue.path === 'key')).toBe(true)
    }
  })

  it('key 格式非法时报错', () => {
    for (const key of ['Demo_Plugin', 'demo plugin', 'demo.plugin', '插件']) {
      const result = parsePluginManifest({ ...validManifest, key })

      expect(result.success, `key=${key} 应该被拒绝`).toBe(false)
      if (!result.success) {
        expect(result.issues.some(issue => issue.path === 'key')).toBe(true)
      }
    }
  })

  it('key 格式合法时通过', () => {
    for (const key of ['demo', 'demo-notifier', 'demo2', 'a-b-c-1']) {
      expect(parsePluginManifest({ ...validManifest, key }).success, `key=${key} 应该通过`).toBe(true)
    }
  })

  it('未知类型时报错', () => {
    const result = parsePluginManifest({ ...validManifest, type: 'unknown-type' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some(issue => issue.path === 'type')).toBe(true)
    }
  })

  it('未登记的扩展点时报错', () => {
    const result = parsePluginManifest({ ...validManifest, hooks: ['not.a.hook'] })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some(issue => issue.path === 'hooks.0')).toBe(true)
    }
  })

  it('configSchema 不是 JSON Schema 对象时报错', () => {
    const result = parsePluginManifest({ ...validManifest, configSchema: 'not-a-schema' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some(issue => issue.path === 'configSchema')).toBe(true)
    }
  })

  it('configSchema.type 不是 object 时报错', () => {
    const result = parsePluginManifest({
      ...validManifest,
      configSchema: { type: 'string', properties: {} }
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.some(issue => issue.path === 'configSchema.type')).toBe(true)
    }
  })

  it('validatePluginManifest 非法时抛 PluginManifestError 并带上问题列表', () => {
    expect(() => validatePluginManifest({ name: '缺少 key', version: '1', type: 'notify' }))
      .toThrow(PluginManifestError)

    try {
      validatePluginManifest({ name: '缺少 key', version: '1', type: 'notify' })
    } catch (error) {
      expect(error).toBeInstanceOf(PluginManifestError)
      expect((error as PluginManifestError).issues.length).toBeGreaterThan(0)
    }
  })
})
