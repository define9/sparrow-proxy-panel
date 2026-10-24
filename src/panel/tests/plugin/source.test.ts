import { describe, expect, it } from 'vitest'
import { validatePluginManifest } from '../../server/utils/plugin-host/manifest'
import {
  parseSourceIndex,
  pluginCanonicalJson,
  pluginCompareVersions,
  pluginCompareWithInstalled,
  pluginSha256,
  verifyManifestChecksum
} from '../../server/utils/plugin-host/source'

/**
 * 三方源索引：解析、checksum 校验、与已安装版本比对。
 */

const rawManifest = {
  key: 'demo-notifier',
  name: '示例通知插件',
  version: '1.2.0',
  type: 'notify'
}

function checksumOf(manifest: unknown): string {
  return pluginSha256(pluginCanonicalJson(validatePluginManifest(manifest)))
}

describe('三方源索引', () => {
  it('规范化 JSON 与键顺序无关', () => {
    expect(pluginCanonicalJson({ b: 1, a: 2 })).toBe(pluginCanonicalJson({ a: 2, b: 1 }))
    expect(pluginCanonicalJson({ a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1}}')
  })

  it('解析索引并校验每项 checksum', () => {
    const index = JSON.stringify({
      plugins: [
        { manifest: rawManifest, checksum: checksumOf(rawManifest) },
        { manifest: { ...rawManifest, key: 'other' }, checksum: 'sha256:deadbeef' }
      ]
    })

    const result = parseSourceIndex(index)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.key).toBe('demo-notifier')
    expect(result.entries[0]?.version).toBe('1.2.0')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.key).toBe('other')
    expect(result.issues[0]?.message).toContain('checksum')
  })

  it('缺少 checksum 的条目会被跳过', () => {
    const index = JSON.stringify({ plugins: [{ manifest: rawManifest }] })

    const result = parseSourceIndex(index)

    expect(result.entries).toHaveLength(0)
    expect(result.issues[0]?.message).toContain('checksum')
  })

  it('清单非法的条目会被跳过', () => {
    const index = JSON.stringify({
      plugins: [{ manifest: { ...rawManifest, key: 'Bad Key' }, checksum: 'sha256:xxx' }]
    })

    const result = parseSourceIndex(index)

    expect(result.entries).toHaveLength(0)
    expect(result.issues[0]?.message).toContain('清单校验失败')
  })

  it('索引不是合法 JSON 时报错', () => {
    const result = parseSourceIndex('not json')

    expect(result.entries).toHaveLength(0)
    expect(result.issues[0]?.message).toContain('JSON')
  })

  it('checksum 校验同时接受规范化与原始序列化', () => {
    const manifest = validatePluginManifest(rawManifest)

    expect(verifyManifestChecksum(manifest, pluginSha256(pluginCanonicalJson(manifest)))).toBe(true)
    expect(verifyManifestChecksum(manifest, pluginSha256(JSON.stringify(manifest)))).toBe(true)
    expect(verifyManifestChecksum(manifest, 'sha256:0000')).toBe(false)
  })

  it('版本比较按语义化版本', () => {
    expect(pluginCompareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0)
    expect(pluginCompareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(pluginCompareVersions('v1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(pluginCompareVersions('0.9.0', '1.0.0')).toBeLessThan(0)
  })

  it('与已安装插件比对得出 new / installed / update', () => {
    const index = JSON.stringify({
      plugins: [
        { manifest: rawManifest, checksum: checksumOf(rawManifest) },
        { manifest: { ...rawManifest, key: 'installed-plugin', version: '1.0.0' }, checksum: checksumOf({ ...rawManifest, key: 'installed-plugin', version: '1.0.0' }) },
        { manifest: { ...rawManifest, key: 'old-plugin', version: '2.0.0' }, checksum: checksumOf({ ...rawManifest, key: 'old-plugin', version: '2.0.0' }) }
      ]
    })

    const result = parseSourceIndex(index)
    const comparison = pluginCompareWithInstalled(result.entries, [
      { key: 'installed-plugin', version: '1.0.0' },
      { key: 'old-plugin', version: '1.0.0' }
    ])

    expect(comparison.find(item => item.key === 'demo-notifier')?.state).toBe('new')
    expect(comparison.find(item => item.key === 'installed-plugin')?.state).toBe('installed')
    expect(comparison.find(item => item.key === 'old-plugin')?.state).toBe('update')
  })
})
