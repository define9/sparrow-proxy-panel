import type { CoreUserRule } from '@sparrow/contracts'
import { describe, expect, it } from 'vitest'
import {
  buildSingBoxTransport,
  buildSingBoxTls,
  buildSingBoxUsers,
  renderSingBoxConfig
} from '../../server/utils/node/config-singbox'

const baseNode = {
  id: '6f8a1a5e-2b3c-4d5e-8f90-1a2b3c4d5e6f',
  name: 'hk-01',
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
  alpn: ['h2', 'http/1.1'],
  allowInsecure: false,
  realityPublicKey: null,
  realityShortId: null,
  fingerprint: null,
  certificateId: null
}

const rules: CoreUserRule[] = [
  {
    email: 'u_1a2b3c4d',
    uid: 1001,
    limit: 10737418240,
    downloadSpeed: 0,
    uploadSpeed: 0,
    deviceLimit: 3,
    enabled: true
  },
  {
    email: 'u_5e6f7a8b',
    uid: 1002,
    limit: 0,
    downloadSpeed: 5242880,
    uploadSpeed: 1048576,
    deviceLimit: 0,
    enabled: false
  }
]

describe('config-singbox · 渲染快照', () => {
  it('VLESS + WebSocket + TLS 节点', () => {
    expect(renderSingBoxConfig(baseNode, rules)).toMatchInlineSnapshot(`
      {
        "dns": {
          "final": "remote",
          "rules": [],
          "servers": [
            {
              "address": "https://1.1.1.1/dns-query",
              "detour": "direct",
              "tag": "remote",
            },
            {
              "address": "local",
              "detour": "direct",
              "tag": "local",
            },
          ],
        },
        "inbounds": [
          {
            "listen": "::",
            "listen_port": 443,
            "tag": "inbound-443",
            "tls": {
              "alpn": [
                "h2",
                "http/1.1",
              ],
              "enabled": true,
              "insecure": false,
              "server_name": "cdn.example.com",
            },
            "transport": {
              "headers": {
                "Host": "cdn.example.com",
              },
              "path": "/ws",
              "type": "ws",
            },
            "type": "vless",
            "users": [
              {
                "flow": "xtls-rprx-vision",
                "name": "u_1a2b3c4d",
                "uuid": "b831381d-6324-4d53-ad4f-8cda48b30811",
              },
            ],
          },
        ],
        "log": {
          "level": "info",
          "timestamp": true,
        },
        "outbounds": [
          {
            "tag": "direct",
            "type": "direct",
          },
          {
            "tag": "block",
            "type": "block",
          },
        ],
        "route": {
          "auto_detect_interface": true,
          "final": "direct",
          "rules": [
            {
              "outbound": "block",
              "protocol": "bittorrent",
            },
            {
              "ip_is_private": true,
              "outbound": "direct",
            },
          ],
        },
      }
    `)
  })

  it('REALITY + gRPC + TCP 节点', () => {
    const config = renderSingBoxConfig({
      ...baseNode,
      protocol: 'vless',
      network: 'grpc',
      path: 'grpc-service',
      tlsMode: 'reality',
      sni: 'www.microsoft.com',
      alpn: [],
      fingerprint: 'chrome',
      realityPublicKey: 'k9hYvVJ8s3Zx0Qq6m5r1Tn2Wb3Cd4Ef5Gh6Ij7Kl8Mn9Op',
      realityShortId: '1a2b3c4d'
    }, rules)

    expect(config).toMatchInlineSnapshot(`
      {
        "dns": {
          "final": "remote",
          "rules": [],
          "servers": [
            {
              "address": "https://1.1.1.1/dns-query",
              "detour": "direct",
              "tag": "remote",
            },
            {
              "address": "local",
              "detour": "direct",
              "tag": "local",
            },
          ],
        },
        "inbounds": [
          {
            "listen": "::",
            "listen_port": 443,
            "tag": "inbound-443",
            "tls": {
              "alpn": [],
              "enabled": true,
              "insecure": false,
              "reality": {
                "enabled": true,
                "public_key": "k9hYvVJ8s3Zx0Qq6m5r1Tn2Wb3Cd4Ef5Gh6Ij7Kl8Mn9Op",
                "short_id": "1a2b3c4d",
              },
              "server_name": "www.microsoft.com",
              "utls": {
                "enabled": true,
                "fingerprint": "chrome",
              },
            },
            "transport": {
              "service_name": "grpc-service",
              "type": "grpc",
            },
            "type": "vless",
            "users": [
              {
                "flow": "xtls-rprx-vision",
                "name": "u_1a2b3c4d",
                "uuid": "b831381d-6324-4d53-ad4f-8cda48b30811",
              },
            ],
          },
        ],
        "log": {
          "level": "info",
          "timestamp": true,
        },
        "outbounds": [
          {
            "tag": "direct",
            "type": "direct",
          },
          {
            "tag": "block",
            "type": "block",
          },
        ],
        "route": {
          "auto_detect_interface": true,
          "final": "direct",
          "rules": [
            {
              "outbound": "block",
              "protocol": "bittorrent",
            },
            {
              "ip_is_private": true,
              "outbound": "direct",
            },
          ],
        },
      }
    `)
  })

  it('Trojan + TCP 节点（无 TLS）', () => {
    const config = renderSingBoxConfig({
      ...baseNode,
      protocol: 'trojan',
      network: 'tcp',
      tlsMode: 'none',
      password: 'trojan-pass',
      path: null,
      hostHeader: null,
      flow: null,
      uuid: null
    }, rules)

    expect(config.inbounds).toMatchInlineSnapshot(`
      [
        {
          "listen": "::",
          "listen_port": 443,
          "tag": "inbound-443",
          "type": "trojan",
          "users": [
            {
              "name": "u_1a2b3c4d",
              "password": "trojan-pass",
            },
          ],
        },
      ]
    `)
  })

  it('Shadowsocks 节点带加密方式', () => {
    const config = renderSingBoxConfig({
      ...baseNode,
      protocol: 'shadowsocks',
      network: 'tcp',
      tlsMode: 'none',
      method: 'aes-256-gcm',
      password: 'ss-pass',
      uuid: null,
      flow: null
    }, rules)

    expect(config.inbounds).toMatchInlineSnapshot(`
      [
        {
          "listen": "::",
          "listen_port": 443,
          "method": "aes-256-gcm",
          "tag": "inbound-443",
          "type": "shadowsocks",
          "users": [
            {
              "name": "u_1a2b3c4d",
              "password": "ss-pass",
            },
          ],
        },
      ]
    `)
  })

  it('Hysteria2 / TUIC 节点补齐协议专属字段', () => {
    const hysteria = renderSingBoxConfig({
      ...baseNode,
      protocol: 'hysteria2',
      network: 'tcp',
      tlsMode: 'none',
      password: 'hy-pass',
      uuid: null,
      flow: null
    }, rules)

    expect(hysteria.inbounds).toMatchInlineSnapshot(`
      [
        {
          "listen": "::",
          "listen_port": 443,
          "tag": "inbound-443",
          "type": "hysteria2",
          "users": [
            {
              "name": "u_1a2b3c4d",
              "password": "hy-pass",
            },
          ],
        },
      ]
    `)

    const tuic = renderSingBoxConfig({
      ...baseNode,
      protocol: 'tuic',
      network: 'tcp',
      tlsMode: 'none',
      password: 'tuic-pass',
      uuid: 'b831381d-6324-4d53-ad4f-8cda48b30811',
      flow: null
    }, rules)

    expect(tuic.inbounds).toMatchInlineSnapshot(`
      [
        {
          "congestion_control": "bbr",
          "listen": "::",
          "listen_port": 443,
          "tag": "inbound-443",
          "type": "tuic",
          "udp_relay_mode": "native",
          "users": [
            {
              "name": "u_1a2b3c4d",
              "password": "tuic-pass",
              "uuid": "b831381d-6324-4d53-ad4f-8cda48b30811",
            },
          ],
        },
      ]
    `)
  })

  it('绑定证书时输出证书文件路径', () => {
    const config = renderSingBoxConfig({
      ...baseNode,
      certificateId: 'cert-id-1'
    }, rules, [{
      id: 'cert-id-1',
      name: 'edge cert',
      cert: '-----BEGIN CERTIFICATE-----\nxxx\n-----END CERTIFICATE-----',
      key: 'secret'
    }])

    expect(config.inbounds?.[0]).toMatchObject({
      tls: {
        certificate_path: '/etc/sparrow/certs/edge-cert.crt',
        key_path: '/etc/sparrow/certs/edge-cert.key'
      }
    })
  })

  it('serverPort 优先于对外端口', () => {
    const config = renderSingBoxConfig({ ...baseNode, port: 443, serverPort: 8443 }, rules)
    expect(config.inbounds?.[0]).toMatchObject({ listen_port: 8443, tag: 'inbound-8443' })
  })
})

describe('config-singbox · 用户与传输', () => {
  it('禁用的规则不会生成内核用户', () => {
    expect(buildSingBoxUsers(baseNode, rules)).toHaveLength(1)
  })

  it('缺少凭据时跳过该用户', () => {
    const users = buildSingBoxUsers({ ...baseNode, uuid: null }, rules)
    expect(users).toHaveLength(0)
  })

  it('sing-box 不支持 mKCP，不生成 transport', () => {
    expect(buildSingBoxTransport({ ...baseNode, network: 'kcp' })).toBeNull()
  })

  it('TCP 不生成 transport', () => {
    expect(buildSingBoxTransport({ ...baseNode, network: 'tcp' })).toBeNull()
  })

  it('未开启 TLS 时不生成 tls 段', () => {
    expect(buildSingBoxTls({ ...baseNode, tlsMode: 'none' })).toBeNull()
  })
})
