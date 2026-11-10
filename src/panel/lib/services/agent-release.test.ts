import { describe, expect, it } from 'vitest'
import { normalizeAgentRelease, versionFromTag } from './agent-release'

const SHA = '280fe828b60b90ee0b5dd5d8e940a06cc258d7acaf292cf04a71ba5f2c2e738b'

describe('versionFromTag', () => {
  it('从 agent/v0.1.0 解析出版本', () => {
    expect(versionFromTag('agent/v0.1.0')).toBe('0.1.0')
  })

  it('识别纯版本 tag', () => {
    expect(versionFromTag('0.2.3')).toBe('0.2.3')
  })

  it('识别带预发布后缀的版本', () => {
    expect(versionFromTag('agent/v1.0.0-beta.1')).toBe('1.0.0-beta.1')
  })

  it('识别不出时返回空串（不抛错）', () => {
    expect(versionFromTag('agent/latest')).toBe('')
    expect(versionFromTag('')).toBe('')
  })
})

describe('normalizeAgentRelease', () => {
  it('未配置时返回 source=none，绝不抛错', () => {
    const result = normalizeAgentRelease(null)
    expect(result.source).toBe('none')
    expect(result.assets).toEqual({})
    expect(result.installScript).toBe('/agent/install.sh')
  })

  it('正常配置：解析出 url + sha256', () => {
    const result = normalizeAgentRelease({
      source: 'github',
      repo: 'define9/sparrow-proxy-panel',
      tag: 'agent/v0.1.0',
      assets: { 'linux-amd64': { url: 'https://example.com/a', sha256: SHA } }
    })

    expect(result.source).toBe('github')
    expect(result.version).toBe('0.1.0')
    expect(result.assets['linux-amd64']).toEqual({ url: 'https://example.com/a', sha256: SHA })
  })

  it('version 为空时从 tag 推导', () => {
    const result = normalizeAgentRelease({
      tag: 'agent/v2.3.4',
      assets: { 'linux-amd64': { url: 'https://example.com/a', sha256: SHA } }
    })
    expect(result.version).toBe('2.3.4')
  })

  it('sha256 不是 64 位十六进制时丢弃该条目', () => {
    const result = normalizeAgentRelease({
      tag: 'agent/v0.1.0',
      assets: {
        'linux-amd64': { url: 'https://example.com/a', sha256: 'too-short' },
        'linux-arm64': { url: 'https://example.com/b', sha256: SHA }
      }
    })

    expect(result.assets['linux-amd64']).toBeUndefined()
    expect(result.assets['linux-arm64']).toBeDefined()
  })

  it('缺 url 时丢弃该条目', () => {
    const result = normalizeAgentRelease({
      assets: { 'linux-amd64': { sha256: SHA } }
    })
    expect(result.assets).toEqual({})
    expect(result.source).toBe('none')
  })

  it('所有条目都非法时降级为 source=none（install.sh 会去试旧路径）', () => {
    const result = normalizeAgentRelease({
      tag: 'agent/v0.1.0',
      repo: 'o/r',
      assets: { 'linux-amd64': { url: '', sha256: '' } }
    })
    expect(result.source).toBe('none')
    expect(result.assets).toEqual({})
    expect(result.tag).toBe('agent/v0.1.0')
  })

  it('assets 不是对象时降级', () => {
    const result = normalizeAgentRelease({ assets: 'not-an-object' as unknown as Record<string, never> })
    expect(result.source).toBe('none')
  })

  it('支持 custom-url 源', () => {
    const result = normalizeAgentRelease({
      source: 'custom-url',
      tag: 'agent/v0.1.0',
      assets: { 'linux-amd64': { url: 'https://cdn.example.com/a', sha256: SHA } }
    })
    expect(result.source).toBe('custom-url')
  })

  it('未知 source 归一到 github', () => {
    const result = normalizeAgentRelease({
      source: 'weird',
      assets: { 'linux-amd64': { url: 'https://example.com/a', sha256: SHA } }
    })
    expect(result.source).toBe('github')
  })

  it('sha256 大写会被归一为小写', () => {
    const result = normalizeAgentRelease({
      assets: { 'linux-amd64': { url: 'https://example.com/a', sha256: SHA.toUpperCase() } }
    })
    expect(result.assets['linux-amd64'].sha256).toBe(SHA)
  })

  it('installScript 缺省为 /agent/install.sh', () => {
    const result = normalizeAgentRelease({
      assets: { 'linux-amd64': { url: 'https://example.com/a', sha256: SHA } }
    })
    expect(result.installScript).toBe('/agent/install.sh')
  })
})
