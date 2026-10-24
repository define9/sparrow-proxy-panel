import { describe, expect, it } from 'vitest'
import { renderV2Ray } from '../../server/utils/subscription/v2ray'
import { buildNodeProfile, mbpsToBps, quotaBytesForRate } from '../../server/utils/subscription/limits'
import { decodeV2Ray, decodeVmess, makeNode, makeSubscription } from './fixtures'

describe('renderV2Ray', () => {
  it('空节点返回空的 base64 正文', () => {
    const payload = renderV2Ray(makeSubscription(), [])

    expect(payload).toBe('')
    expect(decodeV2Ray(payload)).toEqual([])
  })

  it('单个 vmess 节点输出 base64 JSON 链接', () => {
    const payload = renderV2Ray(makeSubscription(), [makeNode()])
    const links = decodeV2Ray(payload)

    expect(links).toHaveLength(1)
    expect(links[0]!.startsWith('vmess://')).toBe(true)

    const vmess = decodeVmess(links[0]!)
    expect(vmess.v).toBe('2')
    expect(vmess.ps).toBe('香港 01')
    expect(vmess.add).toBe('hk.example.com')
    expect(vmess.port).toBe('443')
    expect(vmess.id).toBe('33333333-3333-4333-8333-333333333333')
    expect(vmess.net).toBe('ws')
    expect(vmess.path).toBe('/ws')
    expect(vmess.tls).toBe('tls')
    expect(vmess.sni).toBe('hk.example.com')
    expect(vmess.alpn).toBe('h2,http/1.1')
  })

  it('多协议节点各占一行', () => {
    const payload = renderV2Ray(makeSubscription(), [
      makeNode({ name: '香港 01', protocol: 'vmess' }),
      makeNode({
        name: '日本 01',
        protocol: 'vless',
        uuid: '44444444-4444-4444-8444-444444444444',
        flow: 'xtls-rprx-vision',
        network: 'tcp',
        path: null,
        hostHeader: null
      }),
      makeNode({
        name: '新加坡 01',
        protocol: 'trojan',
        password: 'trojan-pass',
        network: 'grpc',
        path: 'grpc-service'
      }),
      makeNode({
        name: '美国 01',
        protocol: 'shadowsocks',
        method: 'aes-256-gcm',
        password: 'ss-pass',
        network: 'tcp',
        path: null,
        hostHeader: null
      })
    ])

    const links = decodeV2Ray(payload)

    expect(links).toHaveLength(4)
    expect(links[0]!.startsWith('vmess://')).toBe(true)
    expect(links[1]!.startsWith('vless://')).toBe(true)
    expect(links[2]!.startsWith('trojan://')).toBe(true)
    expect(links[3]!.startsWith('ss://')).toBe(true)

    expect(links[1]).toContain('44444444-4444-4444-8444-444444444444@hk.example.com:443')
    expect(links[1]).toContain('flow=xtls-rprx-vision')
    expect(links[1]).toContain('security=tls')
    expect(links[2]).toContain('trojan-pass@hk.example.com:443')
    expect(links[2]).toContain('serviceName=grpc-service')
    expect(links[3]).toContain('@hk.example.com:443')
  })

  it('限速按 Mbps 写入 vmess 的 uplink / downlink', () => {
    const subscription = makeSubscription({ speedLimitMbps: 100 })
    const payload = renderV2Ray(subscription, [makeNode()])
    const vmess = decodeVmess(decodeV2Ray(payload)[0]!)

    expect(vmess.uplink).toBe('100')
    expect(vmess.downlink).toBe('100')
  })

  it('限速换算为 bps 且不限速时为 0', () => {
    expect(mbpsToBps(100)).toBe(100_000_000)
    expect(mbpsToBps(0)).toBe(0)
    expect(mbpsToBps(-1)).toBe(0)

    const profile = buildNodeProfile(makeSubscription({ speedLimitMbps: 50 }), makeNode())
    expect(profile.speedLimitMbps).toBe(50)
    expect(profile.downloadBps).toBe(50_000_000)
    expect(profile.uploadBps).toBe(50_000_000)
  })

  it('流量配额按节点倍率换算，并体现在节点名上', () => {
    const subscription = makeSubscription({
      trafficLimit: 100 * 1024 ** 3,
      trafficUsed: 20 * 1024 ** 3
    })
    const node = makeNode({ trafficRate: 2 })

    const profile = buildNodeProfile(subscription, node)

    expect(profile.quota.remainingBytes).toBe(80 * 1024 ** 3)
    expect(profile.quota.usedRatio).toBeCloseTo(0.2, 6)
    expect(profile.quotaBytes).toBe(40 * 1024 ** 3)
    expect(profile.label).toBe('香港 01 [2x]')
    expect(quotaBytesForRate(80 * 1024 ** 3, 2)).toBe(40 * 1024 ** 3)

    const links = decodeV2Ray(renderV2Ray(subscription, [node]))
    expect(decodeVmess(links[0]!).ps).toBe('香港 01 [2x]')
  })

  it('不限速时不下发 uplink / downlink', () => {
    const payload = renderV2Ray(makeSubscription({ speedLimitMbps: 0 }), [makeNode()])
    const vmess = decodeVmess(decodeV2Ray(payload)[0]!)

    expect(vmess.uplink).toBeUndefined()
    expect(vmess.downlink).toBeUndefined()
  })
})
