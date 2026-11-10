import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAgentRelease,
  invalidateAgentReleaseCache,
  normalizeGithubRelease,
  platformFromAssetName,
  versionFromTag
} from './agent-release'

const SHA_A = '280fe828b60b90ee0b5dd5d8e940a06cc258d7acaf292cf04a71ba5f2c2e738b'
const SHA_B = '98cdfce8e4a8db2518b76b0fe732f101ef590ec9eb4f44edaba18db95dd4e6bd'

/** 造一个 GitHub Release（只造面板用到的字段） */
function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'agent/v0.1.0',
    draft: false,
    prerelease: false,
    published_at: '2026-01-01T00:00:00Z',
    assets: [
      {
        name: 'sparrow-agent-linux-amd64',
        browser_download_url: 'https://github.com/o/r/releases/download/agent%2Fv0.1.0/sparrow-agent-linux-amd64',
        digest: `sha256:${SHA_A}`,
        size: 7461424
      },
      {
        name: 'sparrow-agent-linux-arm64',
        browser_download_url: 'https://github.com/o/r/releases/download/agent%2Fv0.1.0/sparrow-agent-linux-arm64',
        digest: `sha256:${SHA_B}`,
        size: 7015970
      },
      { name: 'SHA256SUMS', browser_download_url: 'https://github.com/o/r/SHA256SUMS', digest: 'sha256:aa' }
    ],
    ...overrides
  }
}

describe('versionFromTag', () => {
  it('从 agent/v0.1.0 解析出版本', () => {
    expect(versionFromTag('agent/v0.1.0')).toBe('0.1.0')
  })

  it('识别不带前缀的版本', () => {
    expect(versionFromTag('v0.2.3')).toBe('0.2.3')
    expect(versionFromTag('0.2.3')).toBe('0.2.3')
  })

  it('识别预发布后缀', () => {
    expect(versionFromTag('agent/v1.0.0-beta.1')).toBe('1.0.0-beta.1')
  })

  it('识别不出时返回空串（不抛错）', () => {
    expect(versionFromTag('agent/latest')).toBe('')
    expect(versionFromTag('')).toBe('')
  })
})

describe('platformFromAssetName', () => {
  it('识别各平台资产名', () => {
    expect(platformFromAssetName('sparrow-agent-linux-amd64')).toBe('linux-amd64')
    expect(platformFromAssetName('sparrow-agent-linux-armv7')).toBe('linux-armv7')
    expect(platformFromAssetName('sparrow-agent-darwin-arm64')).toBe('darwin-arm64')
  })

  it('去掉 windows 的 .exe 后缀', () => {
    expect(platformFromAssetName('sparrow-agent-windows-amd64.exe')).toBe('windows-amd64')
  })

  it('非二进制资产返回 null（SHA256SUMS / latest.json / 前缀不对）', () => {
    expect(platformFromAssetName('SHA256SUMS')).toBeNull()
    expect(platformFromAssetName('latest.json')).toBeNull()
    expect(platformFromAssetName('other-linux-amd64')).toBeNull()
    expect(platformFromAssetName('sparrow-agent-linux')).toBeNull()
  })
})

describe('normalizeGithubRelease', () => {
  it('正常发布：解析出 url / sha256 / size', () => {
    const view = normalizeGithubRelease([release()], { repo: 'o/r' })

    expect(view.source).toBe('github')
    expect(view.repo).toBe('o/r')
    expect(view.tag).toBe('agent/v0.1.0')
    expect(view.version).toBe('0.1.0')
    expect(view.assets['linux-amd64']).toEqual({
      url: 'https://github.com/o/r/releases/download/agent%2Fv0.1.0/sparrow-agent-linux-amd64',
      sha256: SHA_A,
      size: 7461424
    })
    expect(view.assets['linux-arm64'].sha256).toBe(SHA_B)
    expect(view.fetchedAt).not.toBeNull()
  })

  it('忽略 SHA256SUMS 这类非平台资产', () => {
    const view = normalizeGithubRelease([release()], { repo: 'o/r' })
    expect(Object.keys(view.assets).sort()).toEqual(['linux-amd64', 'linux-arm64'])
    expect(platformFromAssetName('SHA256SUMS')).toBeNull()
  })

  it('多版本时取最新（按 published_at）', () => {
    const view = normalizeGithubRelease(
      [
        release({ tag_name: 'agent/v0.1.0', published_at: '2026-01-01T00:00:00Z' }),
        release({ tag_name: 'agent/v0.2.0', published_at: '2026-03-01T00:00:00Z' })
      ],
      { repo: 'o/r' }
    )
    expect(view.version).toBe('0.2.0')
  })

  it('只看 agent/ 前缀的 tag，别的 Release 不参与', () => {
    const view = normalizeGithubRelease(
      [
        release({ tag_name: 'v9.9.9', published_at: '2026-05-01T00:00:00Z' }),
        release({ tag_name: 'agent/v0.2.0', published_at: '2026-03-01T00:00:00Z' })
      ],
      { repo: 'o/r' }
    )
    expect(view.version).toBe('0.2.0')
  })

  it('跳过 draft', () => {
    const view = normalizeGithubRelease(
      [
        release({ tag_name: 'agent/v0.9.0', draft: true, published_at: '2026-05-01T00:00:00Z' }),
        release({ tag_name: 'agent/v0.2.0', published_at: '2026-03-01T00:00:00Z' })
      ],
      { repo: 'o/r' }
    )
    expect(view.version).toBe('0.2.0')
  })

  it('stable 通道跳过 prerelease', () => {
    const view = normalizeGithubRelease(
      [
        release({ tag_name: 'agent/v0.9.0-rc.1', prerelease: true, published_at: '2026-05-01T00:00:00Z' }),
        release({ tag_name: 'agent/v0.2.0', published_at: '2026-03-01T00:00:00Z' })
      ],
      { repo: 'o/r', channel: 'stable' }
    )
    expect(view.version).toBe('0.2.0')
  })

  it('beta 通道允许 prerelease', () => {
    const view = normalizeGithubRelease(
      [
        release({ tag_name: 'agent/v0.9.0-rc.1', prerelease: true, published_at: '2026-05-01T00:00:00Z' })
      ],
      { repo: 'o/r', channel: 'beta' }
    )
    expect(view.version).toBe('0.9.0-rc.1')
    expect(view.channel).toBe('beta')
  })

  it('digest 缺失或不是 sha256 的资产被丢弃', () => {
    const view = normalizeGithubRelease(
      [
        release({
          assets: [
            { name: 'sparrow-agent-linux-amd64', browser_download_url: 'https://x/a', digest: null },
            { name: 'sparrow-agent-linux-arm64', browser_download_url: 'https://x/b', digest: 'sha512:abcd' },
            { name: 'sparrow-agent-darwin-arm64', browser_download_url: 'https://x/c', digest: `sha256:${SHA_A}` }
          ]
        })
      ],
      { repo: 'o/r' }
    )
    expect(Object.keys(view.assets)).toEqual(['darwin-arm64'])
  })

  it('digest 大写会被归一为小写', () => {
    const view = normalizeGithubRelease(
      [
        release({
          assets: [
            { name: 'sparrow-agent-linux-amd64', browser_download_url: 'https://x/a', digest: `sha256:${SHA_A.toUpperCase()}` }
          ]
        })
      ],
      { repo: 'o/r' }
    )
    expect(view.assets['linux-amd64'].sha256).toBe(SHA_A)
  })

  it('没有可用资产时降级为 source=none（保留 tag，便于排查）', () => {
    const view = normalizeGithubRelease([release({ assets: [] })], { repo: 'o/r' })
    expect(view.source).toBe('none')
    expect(view.assets).toEqual({})
    expect(view.tag).toBe('agent/v0.1.0')
  })

  it('没有任何 agent/ Release 时返回 source=none，不抛错', () => {
    const view = normalizeGithubRelease([release({ tag_name: 'v1.0.0' })], { repo: 'o/r' })
    expect(view.source).toBe('none')
    expect(view.assets).toEqual({})
    expect(view.version).toBe('')
  })

  it('GitHub 返回的不是数组时降级', () => {
    expect(normalizeGithubRelease(null).source).toBe('none')
    expect(normalizeGithubRelease({ message: 'Not Found' }).source).toBe('none')
  })

  it('始终带 installScript 与空 signature', () => {
    const view = normalizeGithubRelease([release()], { repo: 'o/r' })
    expect(view.installScript).toBe('/agent/install.sh')
    expect(view.signature).toBe('')
  })
})

describe('getAgentRelease（GitHub 代理 + 缓存）', () => {
  const originalRepo = process.env.AGENT_RELEASE_REPO
  const originalTtl = process.env.AGENT_RELEASE_TTL

  beforeEach(() => {
    invalidateAgentReleaseCache()
    process.env.AGENT_RELEASE_REPO = 'o/r'
    process.env.AGENT_RELEASE_TTL = '600'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    invalidateAgentReleaseCache()
    if (originalRepo === undefined) delete process.env.AGENT_RELEASE_REPO
    else process.env.AGENT_RELEASE_REPO = originalRepo
    if (originalTtl === undefined) delete process.env.AGENT_RELEASE_TTL
    else process.env.AGENT_RELEASE_TTL = originalTtl
  })

  it('首次请求打 GitHub，第二次命中缓存', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([release()]), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await getAgentRelease()
    const second = await getAgentRelease()

    expect(first.source).toBe('github')
    expect(second.version).toBe('0.1.0')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/repos/o/r/releases')
  })

  it('invalidate 后重新请求 GitHub', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([release()]), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await getAgentRelease()
    invalidateAgentReleaseCache()
    await getAgentRelease()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('TTL 过期后重新请求（缓存不是存储）', async () => {
    process.env.AGENT_RELEASE_TTL = '1'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([release()]), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await getAgentRelease()
    // TTL=1s，直接把缓存时间戳往前拨
    const cache = (globalThis as unknown as { __sparrowAgentRelease?: { at: number } }).__sparrowAgentRelease
    if (cache) cache.at = Date.now() - 5000
    await getAgentRelease()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('GitHub 限流时抛 503，错误信息给出可行出路', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403 })
      )
    )

    await expect(getAgentRelease()).rejects.toMatchObject({
      statusCode: 503,
      code: 'AGENT_RELEASE_RATE_LIMITED'
    })
  })

  it('网络不通时抛 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND api.github.com')))

    await expect(getAgentRelease()).rejects.toMatchObject({
      statusCode: 503,
      code: 'AGENT_RELEASE_UNAVAILABLE'
    })
  })

  it('仓库 404 时抛 503 并提示需要 GITHUB_TOKEN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }))
    )

    await expect(getAgentRelease()).rejects.toMatchObject({ statusCode: 503 })
  })

  it('失败不写缓存（GitHub 恢复后立刻可用）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([release()]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getAgentRelease()).rejects.toBeDefined()
    const view = await getAgentRelease()

    expect(view.source).toBe('github')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
