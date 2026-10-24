import type { RenderNode, RenderSubscription } from '../../server/utils/subscription/types'

/** 测试用的订阅夹具（可按用例覆盖字段） */
export function makeSubscription(overrides: Partial<RenderSubscription> = {}): RenderSubscription {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    token: '22222222-2222-4222-8222-222222222222',
    format: 'v2ray',
    status: 'active',
    deviceLimit: 3,
    speedLimitMbps: 0,
    trafficLimit: 100 * 1024 ** 3,
    trafficUsed: 10 * 1024 ** 3,
    upload: 1024 ** 3,
    download: 9 * 1024 ** 3,
    expireAt: '2027-01-01T00:00:00.000Z',
    resetAt: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

/** 测试用的节点夹具（可按用例覆盖字段） */
export function makeNode(overrides: Partial<RenderNode> = {}): RenderNode {
  return {
    name: '香港 01',
    protocol: 'vmess',
    host: 'hk.example.com',
    port: 443,
    network: 'ws',
    path: '/ws',
    hostHeader: 'hk.example.com',
    method: null,
    flow: null,
    password: null,
    uuid: '33333333-3333-4333-8333-333333333333',
    security: 'auto',
    tlsMode: 'tls',
    sni: 'hk.example.com',
    alpn: ['h2', 'http/1.1'],
    allowInsecure: false,
    realityPublicKey: null,
    realityShortId: null,
    fingerprint: 'chrome',
    trafficRate: 1,
    priority: 0,
    weight: 100,
    ...overrides
  }
}

/** 解码 V2Ray 订阅的 base64 正文 */
export function decodeV2Ray(payload: string): string[] {
  const text = Buffer.from(payload, 'base64').toString('utf8')
  return text.length === 0 ? [] : text.split('\n')
}

/** 解码 vmess:// 链接里的 base64 JSON */
export function decodeVmess(link: string): Record<string, string> {
  const payload = link.slice('vmess://'.length)
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, string>
}
