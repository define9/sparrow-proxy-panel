import { NodeGroupSchema, NodeSchema } from '@sparrow/contracts'
import { describe, expect, it } from 'vitest'
import { toNodeDto, toNodeGroupDto } from '../../server/utils/node'

/**
 * 接口返回必须严格符合契约（`@sparrow/contracts`），
 * 否则前端与 Agent 侧的 zod 校验会直接失败。
 */
describe('node DTO · 契约一致性', () => {
  const nodeRow = {
    id: '6f8a1a5e-2b3c-4d5e-8f90-1a2b3c4d5e6f',
    name: 'hk-01',
    groupId: '11111111-2222-4333-8444-555555555555',
    protocol: 'vless' as const,
    host: 'hk01.example.com',
    port: 443,
    serverPort: null,
    network: 'ws' as const,
    path: '/ws',
    hostHeader: 'cdn.example.com',
    method: null,
    flow: 'xtls-rprx-vision',
    password: null,
    uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
    security: null,
    tlsMode: 'tls' as const,
    sni: 'cdn.example.com',
    alpn: ['h2'],
    allowInsecure: false,
    realityPublicKey: null,
    realityShortId: null,
    realitySpiderX: null,
    fingerprint: null,
    privateKey: 'super-secret-private-key',
    publicKey: 'public-key',
    certificateId: null,
    extra: { internal: true },
    trafficRate: '1.50',
    priority: 10,
    weight: 100,
    status: 'online' as const,
    isRelay: false,
    sort: 0,
    remark: '备注',
    lastSeenAt: new Date('2026-10-24T08:00:00.000Z'),
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-24T08:00:00.000Z')
  }

  it('节点 DTO 通过 NodeSchema 校验', () => {
    const dto = toNodeDto(nodeRow, 'HK')
    expect(() => NodeSchema.parse(dto)).not.toThrow()
    expect(dto.groupName).toBe('HK')
    expect(dto.trafficRate).toBe(1.5)
    expect(dto.lastSeenAt).toBe('2026-10-24T08:00:00.000Z')
  })

  it('REALITY 私钥等敏感字段不出现在 DTO 里', () => {
    const dto = toNodeDto(nodeRow, 'HK') as Record<string, unknown>

    expect(dto.privateKey).toBeUndefined()
    expect(dto.publicKey).toBeUndefined()
    expect(dto.realitySpiderX).toBeUndefined()
    expect(dto.extra).toBeUndefined()
    expect(Object.keys(dto)).not.toContain('privateKey')
  })

  it('节点组 DTO 通过 NodeGroupSchema 校验', () => {
    const groupRow = {
      id: '11111111-2222-4333-8444-555555555555',
      name: 'HK',
      sort: 1,
      region: '香港',
      remark: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z')
    }

    const dto = toNodeGroupDto(groupRow, { nodeCount: 3, onlineCount: 2 })
    expect(() => NodeGroupSchema.parse(dto)).not.toThrow()
    expect(dto.nodeCount).toBe(3)
    expect(dto.onlineCount).toBe(2)
  })
})
