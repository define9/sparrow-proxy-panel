import { z } from 'zod'

/** 内核类型 */
export const CoreTypeSchema = z.enum(['sing-box', 'xray'])
export type CoreType = z.infer<typeof CoreTypeSchema>

/**
 * 下发给 Agent 的用户规则。
 *
 * 这是面板与 Agent 之间**必须逐字段一致**的核心结构：
 * Agent 依据 email 标签向内核注册用户，uid 用于回传流量。
 */
export const CoreUserRuleSchema = z.object({
  /** 内核中的用户标识（email 标签） */
  email: z.string().min(1),
  /** 面板侧的用户数字 ID，用于回传流量时关联订阅 */
  uid: z.number().int().nonnegative(),
  /** 流量上限（字节），0 = 不限 */
  limit: z.number().int().nonnegative(),
  /** 下行限速（bps），0 = 不限 */
  downloadSpeed: z.number().int().nonnegative(),
  /** 上行限速（bps），0 = 不限 */
  uploadSpeed: z.number().int().nonnegative(),
  /** 设备/并发连接数上限，0 = 不限 */
  deviceLimit: z.number().int().nonnegative().default(0),
  /** 是否放行（false 表示被配额/封禁拒绝） */
  enabled: z.boolean().default(true)
})
export type CoreUserRule = z.infer<typeof CoreUserRuleSchema>

/** 下发给 Agent 的证书 */
export const CoreCertificateSchema = z.object({
  name: z.string(),
  cert: z.string(),
  key: z.string()
})
export type CoreCertificate = z.infer<typeof CoreCertificateSchema>

/**
 * 内核配置本体。
 *
 * 各内核配置差异大，跨端只保证「JSON 可序列化 + 结构由面板渲染」，
 * 因此这里用宽松对象类型，具体结构由渲染器保证。
 */
export const CoreConfigSchema = z.looseObject({
  log: z.unknown().optional(),
  inbounds: z.array(z.unknown()).optional(),
  outbounds: z.array(z.unknown()).optional(),
  route: z.unknown().optional(),
  dns: z.unknown().optional(),
  experimental: z.unknown().optional(),
  policy: z.unknown().optional()
})
export type CoreConfig = z.infer<typeof CoreConfigSchema>
