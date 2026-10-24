import type { CoreUserRule } from '@sparrow/contracts'
import { describe, expect, it } from 'vitest'
import { NodeRenderError } from '../../server/utils/node/config-singbox'
import { renderXrayConfig } from '../../server/utils/node/config-xray'

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
    downloadSpeed: 0,
    uploadSpeed: 0,
    deviceLimit: 0,
    enabled: false
  }
]

describe('config-xray · 渲染快照', () => {
  it('VLESS + WebSocket + TLS 节点', () => {
    expect(renderXrayConfig(baseNode, rules)).toMatchInlineSnapshot(`
      {
        "dns": {
          "servers": [
            "1.1.1.1",
            "8.8.8.8",
            "localhost",
          ],
        },
        "inbounds": [
          {
            "listen": "0.0.0.0",
            "port": 443,
            "protocol": "vless",
            "settings": {
              "clients": [
                {
                  "email": "u_1a2b3c4d",
                  "flow": "xtls-rprx-vision",
                  "id": "b831381d-6324-4d53-ad4f-8cda48b30811",
                  "level": 0,
                },
              ],
              "decryption": "none",
            },
            "sniffing": {
              "destOverride": [
                "http",
                "tls",
                "quic",
              ],
              "enabled": true,
            },
            "streamSettings": {
              "network": "ws",
              "security": "tls",
              "tlsSettings": {
                "allowInsecure": false,
                "alpn": [
                  "h2",
                  "http/1.1",
                ],
                "serverName": "cdn.example.com",
              },
              "wsSettings": {
                "headers": {
                  "Host": "cdn.example.com",
                },
                "path": "/ws",
              },
            },
            "tag": "inbound-443",
          },
        ],
        "log": {
          "loglevel": "info",
        },
        "outbounds": [
          {
            "protocol": "freedom",
            "tag": "direct",
          },
          {
            "protocol": "blackhole",
            "tag": "block",
          },
        ],
        "policy": {
          "levels": {
            "0": {
              "bufferSize": 4,
              "statsUserDownlink": true,
              "statsUserUplink": true,
            },
          },
          "system": {
            "statsInboundDownlink": true,
            "statsInboundUplink": true,
          },
        },
        "routing": {
          "domainStrategy": "IPIfNonMatch",
          "rules": [
            {
              "ip": [
                "geoip:private",
              ],
              "outboundTag": "direct",
              "type": "field",
            },
            {
              "outboundTag": "block",
              "protocol": [
                "bittorrent",
              ],
              "type": "field",
            },
          ],
        },
      }
    `)
  })

  it('REALITY + TCP 节点', () => {
    const config = renderXrayConfig({
      ...baseNode,
      network: 'tcp',
      tlsMode: 'reality',
      sni: 'www.microsoft.com',
      alpn: [],
      fingerprint: 'chrome',
      realityPublicKey: 'k9hYvVJ8s3Zx0Qq6m5r1Tn2Wb3Cd4Ef5Gh6Ij7Kl8Mn9Op',
      realityShortId: '1a2b3c4d'
    }, rules)

    expect(config.inbounds).toMatchInlineSnapshot(`
      [
        {
          "listen": "0.0.0.0",
          "port": 443,
          "protocol": "vless",
          "settings": {
            "clients": [
              {
                "email": "u_1a2b3c4d",
                "flow": "xtls-rprx-vision",
                "id": "b831381d-6324-4d53-ad4f-8cda48b30811",
                "level": 0,
              },
            ],
            "decryption": "none",
          },
          "sniffing": {
            "destOverride": [
              "http",
              "tls",
              "quic",
            ],
            "enabled": true,
          },
          "streamSettings": {
            "network": "tcp",
            "realitySettings": {
              "fingerprint": "chrome",
              "publicKey": "k9hYvVJ8s3Zx0Qq6m5r1Tn2Wb3Cd4Ef5Gh6Ij7Kl8Mn9Op",
              "serverName": "www.microsoft.com",
              "shortIds": [
                "1a2b3c4d",
              ],
            },
            "security": "reality",
            "tcpSettings": {
              "header": {
                "type": "none",
              },
            },
          },
          "tag": "inbound-443",
        },
      ]
    `)
  })

  it('VMess 节点', () => {
    const config = renderXrayConfig({
      ...baseNode,
      protocol: 'vmess',
      network: 'tcp',
      security: 'auto'
    }, rules)

    expect(config.inbounds).toMatchInlineSnapshot(`
      [
        {
          "listen": "0.0.0.0",
          "port": 443,
          "protocol": "vmess",
          "settings": {
            "clients": [
              {
                "alterId": 0,
                "email": "u_1a2b3c4d",
                "id": "b831381d-6324-4d53-ad4f-8cda48b30811",
                "level": 0,
                "security": "auto",
              },
            ],
          },
          "sniffing": {
            "destOverride": [
              "http",
              "tls",
              "quic",
            ],
            "enabled": true,
          },
          "streamSettings": {
            "network": "tcp",
            "security": "tls",
            "tcpSettings": {
              "header": {
                "type": "none",
              },
            },
            "tlsSettings": {
              "allowInsecure": false,
              "alpn": [
                "h2",
                "http/1.1",
              ],
              "serverName": "cdn.example.com",
            },
          },
          "tag": "inbound-443",
        },
      ]
    `)
  })

  it('Trojan 节点', () => {
    const config = renderXrayConfig({
      ...baseNode,
      protocol: 'trojan',
      network: 'tcp',
      password: 'trojan-pass',
      uuid: null,
      flow: null
    }, rules)

    expect(config.inbounds).toMatchInlineSnapshot(`
      [
        {
          "listen": "0.0.0.0",
          "port": 443,
          "protocol": "trojan",
          "settings": {
            "clients": [
              {
                "email": "u_1a2b3c4d",
                "level": 0,
                "password": "trojan-pass",
              },
            ],
          },
          "sniffing": {
            "destOverride": [
              "http",
              "tls",
              "quic",
            ],
            "enabled": true,
          },
          "streamSettings": {
            "network": "tcp",
            "security": "tls",
            "tcpSettings": {
              "header": {
                "type": "none",
              },
            },
            "tlsSettings": {
              "allowInsecure": false,
              "alpn": [
                "h2",
                "http/1.1",
              ],
              "serverName": "cdn.example.com",
            },
          },
          "tag": "inbound-443",
        },
      ]
    `)
  })

  it('绑定证书时输出证书文件路径', () => {
    const config = renderXrayConfig({
      ...baseNode,
      certificateId: 'cert-id-1'
    }, rules, [{
      id: 'cert-id-1',
      name: 'edge cert',
      cert: '-----BEGIN CERTIFICATE-----\nxxx\n-----END CERTIFICATE-----',
      key: 'secret'
    }])

    expect(config.inbounds?.[0]).toMatchObject({
      streamSettings: {
        tlsSettings: {
          certificates: [
            {
              certificateFile: '/etc/sparrow/certs/edge-cert.crt',
              keyFile: '/etc/sparrow/certs/edge-cert.key'
            }
          ]
        }
      }
    })
  })

  it('Xray 不支持 hysteria2 / tuic，直接抛错', () => {
    expect(() => renderXrayConfig({ ...baseNode, protocol: 'hysteria2' }, rules))
      .toThrow(NodeRenderError)

    expect(() => renderXrayConfig({ ...baseNode, protocol: 'tuic' }, rules))
      .toThrowError(/Xray 内核不支持协议/)
  })
})
