import { nodeHeartbeats, nodeGroups, nodes } from '@/lib/db/schema'

type NodeRow = typeof nodes.$inferSelect
type GroupRow = typeof nodeGroups.$inferSelect
type HeartbeatRow = typeof nodeHeartbeats.$inferSelect

export interface AdminNodeRecord {
  id: string
  name: string
  groupId: string
  groupName: string
  groupRegion: string
  protocol: NodeRow['protocol']
  host: string
  port: number
  serverPort: number | null
  network: NodeRow['network']
  tlsMode: NodeRow['tlsMode']
  sni: string | null
  path: string | null
  rate: number
  trafficRate: string
  status: NodeRow['status']
  priority: number
  weight: number
  core: string
  configVersion: number
  agentVersion: string | null
  onlineUsers: number
  cpu: number
  memory: number
  disk: number
  netRx: string
  netTx: string
  agentRegistered: boolean
  lastSeenAt: string | null
  createdAt: string
  remark: string | null
}

/** 列表/详情统一的序列化：numeric 列转 number，时间转 ISO */
export function toAdminNode(
  node: NodeRow,
  group: Pick<GroupRow, 'name' | 'region'>,
  heartbeat?: HeartbeatRow | null
): AdminNodeRecord {
  return {
    id: node.id,
    name: node.name,
    groupId: node.groupId,
    groupName: group.name,
    groupRegion: group.region,
    protocol: node.protocol,
    host: node.host,
    port: node.port,
    serverPort: node.serverPort,
    network: node.network,
    tlsMode: node.tlsMode,
    sni: node.sni,
    path: node.path,
    rate: Number(node.trafficRate),
    trafficRate: node.trafficRate,
    status: node.status,
    priority: node.priority,
    weight: node.weight,
    core: node.core,
    configVersion: node.configVersion,
    agentVersion: node.agentVersion,
    onlineUsers: heartbeat?.onlineUsers ?? 0,
    cpu: heartbeat ? Number(heartbeat.cpu) : 0,
    memory: heartbeat ? Number(heartbeat.memory) : 0,
    disk: heartbeat ? Number(heartbeat.disk) : 0,
    netRx: heartbeat?.netRx ?? '0',
    netTx: heartbeat?.netTx ?? '0',
    agentRegistered: Boolean(node.agentSecretHash),
    lastSeenAt: node.lastSeenAt?.toISOString() ?? null,
    createdAt: node.createdAt.toISOString(),
    remark: node.remark
  }
}
