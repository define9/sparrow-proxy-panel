import { apiFetch, type ListResponse } from './client'

/** 与 lib/api/node-record.ts 的 AdminNodeRecord 对齐 */
export interface AdminNode {
  id: string
  name: string
  groupId: string
  groupName: string
  groupRegion: string
  protocol: 'vless' | 'vmess' | 'trojan' | 'shadowsocks' | 'hysteria2' | 'tuic'
  host: string
  port: number
  serverPort: number | null
  network: 'tcp' | 'ws' | 'grpc' | 'http' | 'kcp' | 'quic'
  tlsMode: 'none' | 'tls' | 'reality'
  sni: string | null
  path: string | null
  rate: number
  trafficRate: string
  status: 'online' | 'offline' | 'maintenance'
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

export interface AgentEventRecord {
  id: string
  type: string
  level: 'info' | 'warn' | 'error' | string
  message: string | null
  payload: string | null
  createdAt: string
}

export interface AgentCommandRecord {
  id: string
  command: string
  payload: string | null
  status: string
  issuedAt: string
  finishedAt: string | null
  result: string | null
}

export interface AdminNodeDetail extends AdminNode {
  registrationToken: string | null
  events: AgentEventRecord[]
  commands: AgentCommandRecord[]
}

export interface AdminNodeGroup {
  id: string
  name: string
  region: string
  sort: number
  remark: string | null
  createdAt: string
  nodeCount: number
  onlineCount: number
  avgLatency: number | null
}

export interface AdminCertificate {
  id: string
  name: string
  type: string
  issuer: string | null
  notBefore: string | null
  notAfter: string | null
  daysLeft: number | null
  source: string
  autoRenew: boolean
  createdAt: string
}

export interface NodeFilters {
  q?: string
  groupId?: string
  status?: string
  page?: number
  pageSize?: number
}

export interface NodeInput {
  name: string
  groupId: string
  protocol: AdminNode['protocol']
  host: string
  port: number
  network: AdminNode['network']
  tlsMode: AdminNode['tlsMode']
  trafficRate?: number
  status?: AdminNode['status']
  remark?: string
}

export interface NodeGroupInput {
  name: string
  region: string
  sort?: number
  remark?: string | null
}

export interface CertificateInput {
  name: string
  type: string
  cert: string
  key: string
  notAfter?: string | null
}

function qs(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === 'all') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function fetchNodes(filters: NodeFilters = {}) {
  return apiFetch<ListResponse<AdminNode>>(`/api/v1/admin/nodes${qs({ ...filters })}`)
}

export function fetchNode(id: string) {
  return apiFetch<AdminNodeDetail>(`/api/v1/admin/nodes/${id}`)
}

export function createNode(input: NodeInput) {
  return apiFetch<AdminNode & { registrationToken: string }>('/api/v1/admin/nodes', {
    method: 'POST',
    body: input
  })
}

export function updateNode(id: string, input: Partial<NodeInput>) {
  return apiFetch<AdminNode>(`/api/v1/admin/nodes/${id}`, { method: 'PATCH', body: input })
}

export function deleteNode(id: string) {
  return apiFetch<void>(`/api/v1/admin/nodes/${id}`, { method: 'DELETE' })
}

export function syncNode(id: string) {
  return apiFetch<{ configVersion: number; commandId: string; syncedAt: string }>(
    `/api/v1/admin/nodes/${id}/sync`,
    { method: 'POST' }
  )
}

export function fetchNodeGroups() {
  return apiFetch<{ data: AdminNodeGroup[] }>('/api/v1/admin/node-groups')
}

export function createNodeGroup(input: NodeGroupInput) {
  return apiFetch<AdminNodeGroup>('/api/v1/admin/node-groups', { method: 'POST', body: input })
}

export function updateNodeGroup(id: string, input: Partial<NodeGroupInput>) {
  return apiFetch<AdminNodeGroup>('/api/v1/admin/node-groups', {
    method: 'PATCH',
    body: { id, ...input }
  })
}

export function fetchCertificates() {
  return apiFetch<{ data: AdminCertificate[]; meta: { total: number; usageCount: number } }>(
    '/api/v1/admin/node-certificates'
  )
}

export function createCertificate(input: CertificateInput) {
  return apiFetch<AdminCertificate>('/api/v1/admin/node-certificates', {
    method: 'POST',
    body: input
  })
}

export function deleteCertificate(id: string) {
  return apiFetch<void>(`/api/v1/admin/node-certificates/${id}`, { method: 'DELETE' })
}

/** 管理端展示用的注册命令 */
export function buildRegisterCommand(panelUrl: string, token: string) {
  return `sparrow-agent register --url ${panelUrl} --token ${token}`
}
