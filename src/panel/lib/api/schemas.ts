import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('请输入合法邮箱'),
  password: z.string().min(8, '密码至少 8 位'),
  remember: z.boolean().optional()
})

export const registerSchema = z.object({
  email: z.string().email('请输入合法邮箱'),
  code: z.string().min(4, '请输入验证码'),
  password: z.string().min(8, '密码至少 8 位'),
  confirmPassword: z.string().min(8, '请再次输入密码')
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少 8 位')
})

export const profileSchema = z.object({
  username: z.string().min(2, '用户名至少 2 位').max(32),
  email: z.string().email('请输入合法邮箱')
})

export const planInputSchema = z.object({
  name: z.string().min(2, '请填写商品名称'),
  slug: z.string().min(2, '请填写 slug'),
  description: z.string().default(''),
  type: z.enum(['traffic', 'time', 'bandwidth']).default('traffic'),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, '价格格式不正确'),
  originalPrice: z.string().nullable().default(null),
  trafficGb: z.coerce.number().int().nonnegative().default(0),
  durationDays: z.coerce.number().int().positive(),
  deviceLimit: z.coerce.number().int().nonnegative().default(1),
  speedLimitMbps: z.coerce.number().int().nonnegative().default(0),
  stock: z.coerce.number().int().nullable().default(null),
  status: z.enum(['draft', 'active', 'inactive']).default('active'),
  isHot: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  sort: z.coerce.number().int().default(0)
})

export const orderInputSchema = z.object({
  planId: z.string().uuid('商品不存在'),
  couponCode: z.string().optional()
})

export const nodeInputSchema = z.object({
  name: z.string().min(1, '请填写节点名称'),
  groupId: z.string().uuid('请选择节点组'),
  protocol: z.enum(['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic']),
  host: z.string().min(1, '请填写域名或 IP'),
  port: z.coerce.number().int().min(1).max(65535),
  network: z.enum(['tcp', 'ws', 'grpc', 'http', 'kcp', 'quic']).default('tcp'),
  tlsMode: z.enum(['none', 'tls', 'reality']).default('tls'),
  sni: z.string().optional(),
  path: z.string().optional(),
  trafficRate: z.coerce.number().min(0).default(1),
  status: z.enum(['online', 'offline', 'maintenance']).default('offline'),
  remark: z.string().optional()
})

export const couponInputSchema = z.object({
  code: z.string().min(3, '请填写优惠码'),
  type: z.enum(['fixed', 'percent']).default('fixed'),
  value: z.coerce.number().positive('面值必须大于 0'),
  quota: z.coerce.number().int().nonnegative().default(0),
  minAmount: z.coerce.number().nonnegative().default(0),
  expiresAt: z.string().nullable().default(null)
})

export const settingsSchema = z.object({
  site: z
    .object({
      name: z.string().default('Sparrow Panel'),
      logo: z.string().default(''),
      announcement: z.string().default(''),
      icp: z.string().default('')
    })
    .partial(),
  register: z
    .object({
      open: z.boolean().default(true),
      emailVerify: z.boolean().default(false),
      giftTrafficGb: z.coerce.number().nonnegative().default(0),
      inviteRequired: z.boolean().default(false)
    })
    .partial(),
  payment: z
    .object({
      epayEnabled: z.boolean().default(true),
      stripeEnabled: z.boolean().default(false)
    })
    .partial(),
  mail: z
    .object({
      host: z.string().default(''),
      port: z.coerce.number().default(465),
      username: z.string().default(''),
      password: z.string().default('')
    })
    .partial()
})
