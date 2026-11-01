import type { Node } from '@sparrow/contracts'
import { daysLeft } from '@/lib/format'
import { nodeGroups } from './catalog'
import { iso } from './util'

/**
 * 管理端节点页的派生演示数据：证书、节点组统计、节点事件、注册命令。
 * 全部为确定性生成，不改动 catalog 中的共享数据。
 */

export type CertificateType = 'self-signed' | 'acme'
export type CertificateSource = 'manual' | 'acme' | 'imported'

export interface Certificate {
  id: string
  name: string
  type: CertificateType
  issuer: string
  domains: string[]
  validFrom: string
  expiresAt: string
  source: CertificateSource
  autoRenew: boolean
}

export const CERTIFICATE_TYPE_LABEL: Record<CertificateType, string> = {
  'self-signed': '自有',
  acme: 'ACME'
}

export const CERTIFICATE_SOURCE_LABEL: Record<CertificateSource, string> = {
  manual: '手动上传',
  acme: 'ACME 自动续期',
  imported: '历史导入'
}

export const certificates: Certificate[] = [
  {
    id: 'cert_1',
    name: 'hk.example.com',
    type: 'acme',
    issuer: "Let's Encrypt R11",
    domains: ['hk01.example.com', 'hk02.example.com', 'hk03.example.com'],
    validFrom: iso(-85),
    expiresAt: iso(5),
    source: 'acme',
    autoRenew: true
  },
  {
    id: 'cert_2',
    name: 'jp.example.com',
    type: 'acme',
    issuer: 'Google Trust Services WE1',
    domains: ['jp01.example.com', 'jp02.example.com', 'jp03.example.com'],
    validFrom: iso(-72),
    expiresAt: iso(18),
    source: 'acme',
    autoRenew: true
  },
  {
    id: 'cert_3',
    name: 'sg.example.com',
    type: 'self-signed',
    issuer: 'Sparrow Internal CA',
    domains: ['sg01.example.com', 'sg02.example.com'],
    validFrom: iso(-120),
    expiresAt: iso(245),
    source: 'manual',
    autoRenew: false
  },
  {
    id: 'cert_4',
    name: 'legacy.sparrow.dev',
    type: 'self-signed',
    issuer: 'Sparrow Internal CA',
    domains: ['legacy.sparrow.dev'],
    validFrom: iso(-400),
    expiresAt: iso(-12),
    source: 'imported',
    autoRenew: false
  }
]

/** 证书是否在 N 天内到期（含已过期之外的有效证书） */
export function expiringCertificates(list: Certificate[], withinDays = 7) {
  return list.filter((cert) => {
    const left = daysLeft(cert.expiresAt)
    return left >= 0 && left <= withinDays
  })
}

const NODE_CERT_BY_GROUP: Record<string, string> = {
  grp_1: 'cert_1',
  grp_2: 'cert_2',
  grp_3: 'cert_3'
}

/** 节点使用的证书（无 TLS 的节点返回 null） */
export function nodeCertificate(node: Node, list: Certificate[] = certificates) {
  if (node.tlsMode === 'none') return null
  const certId = NODE_CERT_BY_GROUP[node.groupId]
  return list.find((cert) => cert.id === certId) ?? null
}

export const groupLatency: Record<string, number> = {
  grp_1: 32,
  grp_2: 58,
  grp_3: 76
}

export interface NodeGroupStat {
  id: string
  name: string
  region: string
  sort: number
  remark: string
  nodeCount: number
  onlineCount: number
  avgLatency: number
}

/** 由节点列表聚合出每个节点组的统计信息 */
export function buildGroupStats(list: Node[]): NodeGroupStat[] {
  return nodeGroups.map((group) => {
    const groupNodes = list.filter((node) => node.groupId === group.id)
    return {
      ...group,
      nodeCount: groupNodes.length,
      onlineCount: groupNodes.filter((node) => node.status === 'online').length,
      avgLatency: groupLatency[group.id] ?? 0
    }
  })
}

export type NodeEventLevel = 'info' | 'warning' | 'error'

export interface NodeEvent {
  id: string
  level: NodeEventLevel
  title: string
  detail: string
  at: string
}

/** 每个节点最近 3 条事件，按状态派生 */
export function nodeEvents(node: Node): NodeEvent[] {
  const synced: NodeEvent = {
    id: `${node.id}_synced`,
    level: 'info',
    title: '配置同步完成',
    detail: `config_version 12 已下发，${node.core} 热重载成功`,
    at: iso(0, -1)
  }

  if (node.status === 'offline') {
    return [
      {
        id: `${node.id}_timeout`,
        level: 'error',
        title: 'Agent 心跳超时',
        detail: '连续 3 个心跳周期未收到上报，节点被标记为离线',
        at: node.lastSeenAt ?? iso(-1)
      },
      {
        id: `${node.id}_health`,
        level: 'warning',
        title: '健康检查失败',
        detail: '探测 443 端口无响应，请检查内核进程与网络',
        at: iso(-1, -2)
      },
      {
        id: `${node.id}_alert`,
        level: 'info',
        title: '离线告警已发送',
        detail: '已通过 Telegram 通知值班管理员',
        at: iso(-1, -1)
      }
    ]
  }

  if (node.status === 'maintenance') {
    return [
      {
        id: `${node.id}_maint`,
        level: 'warning',
        title: '进入维护模式',
        detail: '管理员手动切换，暂停承载流量',
        at: iso(0, -3)
      },
      {
        id: `${node.id}_stopped`,
        level: 'info',
        title: '内核已停止',
        detail: `${node.core} 进程已退出，等待维护完成`,
        at: iso(0, -2)
      },
      synced
    ]
  }

  return [
    {
      id: `${node.id}_heartbeat`,
      level: 'info',
      title: 'Agent 心跳正常',
      detail: `每 30s 上报一次，当前在线 ${node.onlineUsers} 人`,
      at: iso(0, -0.02)
    },
    synced,
    {
      id: `${node.id}_online`,
      level: 'info',
      title: '节点上线',
      detail: `Agent ${node.agentVersion} 注册成功并拉取首份配置`,
      at: node.createdAt
    }
  ]
}

export function registerToken(node: Node) {
  return `sp_reg_${node.id.replace('node_', '')}a1b2c3d4`
}

export function registerCommand(node: Node, panelUrl = 'https://panel.example.com') {
  return [
    `sparrow-agent register \\`,
    `  --url ${panelUrl} \\`,
    `  --token ${registerToken(node)}`
  ].join('\n')
}
