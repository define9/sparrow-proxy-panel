import { describe, expect, it } from 'vitest'
import { CLASH_GROUP_NAME, renderClash } from '../../server/utils/subscription/clash'
import { buildNodeProfile } from '../../server/utils/subscription/limits'
import { makeNode, makeSubscription } from './fixtures'

describe('renderClash', () => {
  it('空节点输出空 proxies 与空策略组', () => {
    const yaml = renderClash(makeSubscription(), [])

    expect(yaml).toContain('proxies: []')
    expect(yaml).toContain(`name: ${CLASH_GROUP_NAME}`)
    expect(yaml).toContain('type: select')
    expect(yaml).toContain('proxies: []')
  })

  it('单个节点输出完整 proxy 字段', () => {
    const yaml = renderClash(makeSubscription(), [makeNode()])

    expect(yaml).toContain('- name: 香港 01')
    expect(yaml).toContain('type: vmess')
    expect(yaml).toContain('server: hk.example.com')
    expect(yaml).toContain('port: 443')
    expect(yaml).toContain('uuid: 33333333-3333-4333-8333-333333333333')
    expect(yaml).toContain('alterId: 0')
    expect(yaml).toContain('cipher: auto')
    expect(yaml).toContain('tls: true')
    expect(yaml).toContain('servername: hk.example.com')
    expect(yaml).toContain('ws-opts:')
    expect(yaml).toContain('path: /ws')
    expect(yaml).toContain('Host: hk.example.com')
  })

  it('多协议节点输出对应 type', () => {
    const yaml = renderClash(makeSubscription(), [
      makeNode({ name: '香港 01', protocol: 'vmess' }),
      makeNode({ name: '日本 01', protocol: 'vless', uuid: '44444444-4444-4444-8444-444444444444' }),
      makeNode({ name: '新加坡 01', protocol: 'trojan', password: 'trojan-pass' }),
      makeNode({ name: '美国 01', protocol: 'shadowsocks', method: 'aes-256-gcm', password: 'ss-pass' })
    ])

    expect(yaml).toContain('type: vmess')
    expect(yaml).toContain('type: vless')
    expect(yaml).toContain('type: trojan')
    expect(yaml).toContain('type: ss')
    expect(yaml).toContain('cipher: aes-256-gcm')
    expect(yaml).toContain('password: ss-pass')

    // 策略组里列出全部节点
    expect(yaml).toContain('- 香港 01')
    expect(yaml).toContain('- 日本 01')
    expect(yaml).toContain('- 新加坡 01')
    expect(yaml).toContain('- 美国 01')
  })

  it('限速写入 hysteria2 / tuic 的 up 与 down', () => {
    const subscription = makeSubscription({ speedLimitMbps: 200 })
    const yaml = renderClash(subscription, [
      makeNode({ name: '香港 01', protocol: 'hysteria2', password: 'hy2-pass' })
    ])

    expect(yaml).toContain('type: hysteria2')
    expect(yaml).toContain('up: 200')
    expect(yaml).toContain('down: 200')
  })

  it('流量配额按节点倍率换算，节点名带倍率后缀', () => {
    const subscription = makeSubscription({
      trafficLimit: 100 * 1024 ** 3,
      trafficUsed: 20 * 1024 ** 3
    })
    const node = makeNode({ trafficRate: 2 })

    const profile = buildNodeProfile(subscription, node)
    expect(profile.quota.remainingBytes).toBe(80 * 1024 ** 3)
    expect(profile.quotaBytes).toBe(40 * 1024 ** 3)

    const yaml = renderClash(subscription, [node])
    expect(yaml).toContain('- name: "香港 01 [2x]"')
  })
})
