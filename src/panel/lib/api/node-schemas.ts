import { z } from 'zod'

/** 管理端节点列表筛选 */
export const nodeQuerySchema = z.object({
  q: z.string().trim().optional(),
  groupId: z.string().uuid().optional(),
  status: z.enum(['online', 'offline', 'maintenance']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
})

export const nodeUpdateSchema = z.object({
  name: z.string().min(1, '请填写节点名称').optional(),
  groupId: z.string().uuid('请选择节点组').optional(),
  protocol: z.enum(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic']).optional(),
  host: z.string().min(1, '请填写域名或 IP').optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  network: z.enum(['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic']).optional(),
  tlsMode: z.enum(['none', 'tls', 'reality']).optional(),
  sni: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  trafficRate: z.coerce.number().min(0).optional(),
  status: z.enum(['online', 'offline', 'maintenance']).optional(),
  priority: z.coerce.number().int().optional(),
  weight: z.coerce.number().int().min(1).optional(),
  sort: z.coerce.number().int().optional(),
  remark: z.string().nullable().optional()
})

export const nodeGroupInputSchema = z.object({
  name: z.string().min(1, '请填写节点组名称'),
  region: z.string().default(''),
  sort: z.coerce.number().int().default(0),
  remark: z.string().nullable().optional()
})

export const nodeGroupUpdateSchema = z.object({
  id: z.string().uuid('节点组不存在'),
  name: z.string().min(1, '请填写节点组名称').optional(),
  region: z.string().optional(),
  sort: z.coerce.number().int().optional(),
  remark: z.string().nullable().optional()
})

export const certificateInputSchema = z.object({
  name: z.string().min(1, '请填写证书名称'),
  type: z.string().default('generic'),
  cert: z.string().min(1, '请粘贴证书 PEM'),
  key: z.string().min(1, '请粘贴私钥 PEM'),
  issuer: z.string().nullable().optional(),
  notBefore: z.string().datetime({ offset: true }).nullable().optional(),
  /** 不传时按 PEM 解析；解析不了就用占位（+90 天） */
  notAfter: z.string().datetime({ offset: true }).nullable().optional(),
  source: z.string().default('manual')
})

/* ---------------- Agent 协议 ---------------- */

export const agentRegisterSchema = z.object({
  hostname: z.string().max(128).optional(),
  ip: z.string().max(64).optional(),
  agentVersion: z.string().max(32).optional(),
  os: z.string().max(32).optional(),
  arch: z.string().max(32).optional()
})

export const agentHeartbeatSchema = z.object({
  status: z.enum(['online', 'offline', 'maintenance']).default('online'),
  cpu: z.coerce.number().min(0).max(100).default(0),
  memory: z.coerce.number().min(0).max(100).default(0),
  disk: z.coerce.number().min(0).max(100).default(0),
  netRx: z.coerce.number().int().nonnegative().default(0),
  netTx: z.coerce.number().int().nonnegative().default(0),
  onlineUsers: z.coerce.number().int().nonnegative().default(0),
  agentVersion: z.string().max(32).optional(),
  coreVersion: z.string().max(32).optional(),
  core: z.string().max(32).optional(),
  reportedAt: z.string().optional()
})

export const agentTrafficSchema = z.object({
  seq: z.coerce.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        uid: z.coerce.number().int(),
        upload: z.coerce.number().int().nonnegative().default(0),
        download: z.coerce.number().int().nonnegative().default(0)
      })
    )
    .max(1000)
    .default([])
})
