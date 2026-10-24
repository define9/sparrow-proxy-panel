import { z } from 'zod'
import { BytesSchema, CurrencySchema, DateTimeSchema, IdSchema, MoneySchema } from '../common'

export const UserStatusSchema = z.enum(['active', 'disabled', 'pending'])
export type UserStatus = z.infer<typeof UserStatusSchema>

export const RoleSchema = z.object({
  id: IdSchema,
  code: z.string().meta({ example: 'admin' }),
  name: z.string(),
  isSystem: z.boolean(),
  description: z.string().nullish()
})
export type Role = z.infer<typeof RoleSchema>

/** 用户公开信息（不含密钥） */
export const UserSchema = z.object({
  id: IdSchema,
  email: z.email(),
  username: z.string(),
  role: z.string().meta({ description: '角色 code' }),
  status: UserStatusSchema,
  balance: MoneySchema,
  currency: CurrencySchema,
  trafficLimit: BytesSchema,
  trafficUsed: BytesSchema,
  emailVerified: z.boolean(),
  telegramId: z.string().nullish(),
  remark: z.string().nullish(),
  lastLoginAt: DateTimeSchema.nullish(),
  createdAt: DateTimeSchema
})
export type User = z.infer<typeof UserSchema>

export const UpdateProfileSchema = z.object({
  username: z.string().trim().min(1).max(64).optional(),
  telegramId: z.string().trim().max(64).nullish()
})
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
})
export type ChangePassword = z.infer<typeof ChangePasswordSchema>

export const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(64),
  scopes: z.array(z.string()).default([]),
  expiresAt: DateTimeSchema.nullish()
})
export type CreateToken = z.infer<typeof CreateTokenSchema>

export const TokenSchema = z.object({
  id: IdSchema,
  name: z.string(),
  tokenPrefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: DateTimeSchema.nullish(),
  expiresAt: DateTimeSchema.nullish(),
  revokedAt: DateTimeSchema.nullish(),
  createdAt: DateTimeSchema
})
export type Token = z.infer<typeof TokenSchema>
