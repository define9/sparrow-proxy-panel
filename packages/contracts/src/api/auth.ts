import { z } from 'zod'
import { DateTimeSchema } from '../common'

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
  /** 二步验证的挑战 ID（第一阶段返回） */
  challengeId: z.string().optional(),
  code: z.string().length(6).optional()
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const LoginResponseSchema = z.object({
  /** 需要二步验证时为 true，此时不建立会话 */
  need2FA: z.boolean(),
  challengeId: z.string().nullish(),
  user: z.object({
    id: z.string(),
    email: z.email(),
    username: z.string(),
    role: z.string()
  }).nullish()
})
export type LoginResponse = z.infer<typeof LoginResponseSchema>

export const RegisterRequestSchema = z.object({
  email: z.email(),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(128),
  code: z.string().min(4).max(8).meta({ description: '邮箱验证码' }),
  inviteCode: z.string().trim().optional()
})
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>

export const SendCodeRequestSchema = z.object({
  email: z.email(),
  scene: z.enum(['register', 'reset_password']).default('register')
})
export type SendCodeRequest = z.infer<typeof SendCodeRequestSchema>

export const ForgotPasswordRequestSchema = z.object({
  email: z.email(),
  code: z.string().min(4).max(8),
  newPassword: z.string().min(8).max(128)
})
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>

export const TwoFactorVerifyRequestSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().length(6)
})
export type TwoFactorVerifyRequest = z.infer<typeof TwoFactorVerifyRequestSchema>

export const SessionSchema = z.object({
  id: z.string(),
  ip: z.string().nullish(),
  userAgent: z.string().nullish(),
  createdAt: DateTimeSchema,
  lastSeenAt: DateTimeSchema,
  expiresAt: DateTimeSchema
})
export type Session = z.infer<typeof SessionSchema>
