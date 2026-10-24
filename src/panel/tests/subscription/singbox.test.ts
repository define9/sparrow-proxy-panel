import { describe, expect, it } from 'vitest'
import { renderSingbox } from '../../server/utils/subscription/singbox'
import { buildNodeProfile } from '../../server/utils/subscription/limits'
import { makeNode, makeSubscription } from './fixtures'

interface SingboxOutbound {
  type: string
  tag: string
  server: string
  server_port: number
  [key: string]: unknown
}

function parse(payload: string): { outbounds: SingboxOutbound[] } {
  return JSON.parse(payload) as { outbounds: SingboxOutbound[] }
}

describe('renderSingbox', () => {
  it('空节点输出空的 outbounds 数组', () => {
    const config = parse(renderSingbox(makeSubscription(), []))

    expect(config.outbounds).toEqual([])
  })

  it('单个节点输出 outbound 字段', () => {
    const config = parse(renderSingbox(makeSubscription(), [makeNode()]))
    const [outbound] = config.outbounds

    expect(outbound).toBeDefined()
    expect(outbound!.type).toBe('vmess')
    expect(outbound!.tag).toBe('香港 01')
    expect(outbound!.server).toBe('hk.example.com')
    expect(outbound!.server_port).toBe(443)
    expect(outbound!.uuid).toBe('33333333-3333-4333-8333-333333333333')
    expect(outbound!.alter_id).toBe(0)
    expect(outbound!.tls).toMatchObject({
      enabled: true,
      server_name: 'hk.example.com',
      insecure: false
    })
    expect(outbound!.transport).toMatchObject({
      type: 'ws',
      path: '/ws'
    })
  })

  it('多协议节点输出对应 type', () => {
    const config = parse(renderSingbox(makeSubscription(), [
      makeNode({ name: '香港 01', protocol: 'vmess' }),
      makeNode({ name: '日本 01', protocol: 'vless', uuid: '44444444-4444-4444-8444-444444444444' }),
      makeNode({ name: '新加坡 01', protocol: 'trojan', password: 'trojan-pass' }),
      makeNode({ name: '美国 01', protocol: 'shadowsocks', method: 'aes-256-gcm', password: 'ss-pass' })
    ]))

    expect(config.outbounds.map(item => item.type)).toEqual(['vmess', 'vless', 'trojan', 'shadowsocks'])
    expect(config.outbounds[1]!.uuid).toBe('44444444-4444-4444-8444-444444444444')
    expect(config.outbounds[2]!['password']).toBe('trojan-pass')
    expect(config.outbounds[3]!.method).toBe('aes-256-gcm')
    expect(config.outbounds[3]!['password']).toBe('ss-pass')
  })

  it('限速写入 hysteria2 的 up_mbps / down_mbps', () => {
    const subscription = makeSubscription({ speedLimitMbps: 300 })
    const config = parse(renderSingbox(subscription, [
      makeNode({ name: '香港 01', protocol: 'hysteria2', password: 'hy2-pass' })
    ]))

    expect(config.outbounds[0]!.up_mbps).toBe(300)
    expect(config.outbounds[0]!.down_mbps).toBe(300)
  })

  it('流量配额按节点倍率换算，tag 带倍率后缀', () => {
    const subscription = makeSubscription({
      trafficLimit: 100 * 1024 ** 3,
      trafficUsed: 20 * 1024 ** 3
    })
    const node = makeNode({ trafficRate: 2 })

    const profile = buildNodeProfile(subscription, node)
    expect(profile.quota.remainingBytes).toBe(80 * 1024 ** 3)
    expect(profile.quotaBytes).toBe(40 * 1024 ** 3)

    const config = parse(renderSingbox(subscription, [node]))
    expect(config.outbounds[0]!.tag).toBe('香港 01 [2x]')
  })
})
