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
  newPassword: z.string().min(8, '新密码至少 8 位').max(72)
})

/** 用户自助改资料：邮箱是登录凭证，不在可改范围内 */
export const profileUpdateSchema = z.object({
  username: z.string().trim().min(2, '用户名至少 2 位').max(32, '用户名最多 32 位').optional(),
  telegramId: z.string().trim().max(64, 'Telegram 最多 64 位').nullable().optional()
})

/** 创建 API Token：scopes 的白名单校验在 service 里做（与分享常量对齐） */
export const apiTokenCreateSchema = z.object({
  name: z.string().trim().min(1, '请填写 Token 名称').max(64, '名称最多 64 位'),
  scopes: z.array(z.string().trim().min(1).max(64)).max(10).default([]),
  expiresInDays: z.coerce.number().int().min(1).max(365).nullable().optional()
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('请输入合法邮箱')
})

export const resetPasswordSchema = z.object({
  email: z.string().email('请输入合法邮箱'),
  code: z.string().min(4, '请输入验证码'),
  password: z.string().min(8, '密码至少 8 位').max(72)
})

export const mailTestSchema = z.object({
  // 用宽松校验：测试地址常见 a@b.c 这类内网/占位域名，zod 默认 email() 会拒绝
  to: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '请输入合法收件邮箱')
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

export const orderListQuerySchema = z.object({
  status: z.enum(['pending', 'paid', 'cancelled', 'expired', 'refunded']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
})

export const subscriptionUpdateSchema = z.object({
  format: z.enum(['v2ray', 'clash', 'singbox']).optional(),
  deviceLimit: z.coerce.number().int().min(1).max(999).optional()
})

export const trafficRangeSchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d')
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
      // 旧设置页两个开关（仍然写回 gateways.<key>.enabled）
      epayEnabled: z.boolean().optional(),
      stripeEnabled: z.boolean().optional(),
      // 新结构（支付渠道页走 /admin/payment/* 接口，这里保持兼容）
      default: z.string().optional(),
      gateways: z
        .record(
          z.string(),
          z
            .object({
              enabled: z.boolean().optional(),
              config: z.record(z.string(), z.unknown()).optional()
            })
            .partial()
        )
        .optional()
    })
    .partial(),
  mail: z
    .object({
      provider: z.enum(['resend', 'log']).optional(),
      resend: z
        .object({
          apiKey: z.string().optional(),
          from: z.string().optional()
        })
        .partial()
        .optional(),
      smtp: z
        .object({
          host: z.string().optional(),
          port: z.coerce.number().int().min(1).max(65535).optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          from: z.string().optional()
        })
        .partial()
        .optional(),
      testTo: z.string().optional(),
      // 旧版扁平结构（设置页尚未改造时继续兼容）
      host: z.string().optional(),
      port: z.coerce.number().int().min(1).max(65535).optional(),
      username: z.string().optional(),
      password: z.string().optional()
    })
    .partial()
})

export const paymentGatewayUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional()
})

export const paymentDefaultSchema = z.object({
  key: z.string().trim().min(1, '请选择默认支付渠道')
})

export const setupSchema = z
  .object({
    siteName: z.string().trim().min(1, '请填写站点名称').max(64),
    email: z.string().email('请输入合法邮箱'),
    username: z.string().trim().min(2, '用户名至少 2 位').max(32),
    password: z.string().min(8, '密码至少 8 位').max(72),
    confirmPassword: z.string().min(8, '请再次输入密码'),
    token: z.string().optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  })
