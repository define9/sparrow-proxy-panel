import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roles, sessions, users } from '@/lib/db/schema'
import { ApiError } from '@/lib/api/response'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { createSession, destroySession, recordLogin } from '@/lib/auth/session'
import { issueCode, issueResetCode, verifyCode, verifyResetCode } from '@/lib/auth/verification'
import { resolveMailProvider, sendMail } from '@/lib/notify'
import {
  buildLoginCodeMessage,
  buildResetCodeMessage,
  exposesDevCode
} from '@/lib/services/mail'

/**
 * 认证域服务层：登录 / 注册 / 退出。
 *
 * 这里只做编排（账号校验 → 验密 → 建会话 → 写登录日志），
 * 哈希、验证码、会话 cookie 的职责仍留在 lib/auth/* 里。
 * 入参是普通对象，IP / UA 由 route 从请求里取出来传进来。
 */

/** 请求来源环境（route 负责填充） */
export interface ClientMeta {
  ip?: string
  userAgent?: string
}

export interface LoginInput extends ClientMeta {
  email: string
  password: string
}

export interface LoginUser {
  id: string
  email: string
  username: string
  role: string
  status: string
}

export interface LoginResult {
  user: LoginUser
  permissions: string[]
}

export interface RegisterInput extends ClientMeta {
  email: string
  code: string
  password: string
  confirmPassword: string
}

export interface RegisterResult {
  user: { id: string; email: string; username: string }
  permissions: string[]
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email.toLowerCase()

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      passwordHash: users.passwordHash,
      status: users.status,
      roleCode: users.roleCode,
      permissions: roles.permissions
    })
    .from(users)
    .leftJoin(roles, sql`${roles.code} = ${users.roleCode}`)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (!row) {
    await recordLogin({
      email,
      ip: input.ip,
      userAgent: input.userAgent,
      success: false,
      reason: 'user_not_found'
    })
    throw new ApiError(401, 'AUTH_INVALID_CREDENTIALS', '邮箱或密码不正确')
  }

  if (row.status === 'disabled') {
    await recordLogin({ userId: row.id, email, success: false, reason: 'disabled' })
    throw new ApiError(403, 'USER_DISABLED', '账号已被禁用')
  }

  const valid = await verifyPassword(row.passwordHash, input.password)
  if (!valid) {
    await recordLogin({
      userId: row.id,
      email,
      ip: input.ip,
      userAgent: input.userAgent,
      success: false,
      reason: 'bad_password'
    })
    throw new ApiError(401, 'AUTH_INVALID_CREDENTIALS', '邮箱或密码不正确')
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(sql`${users.id} = ${row.id}`)

  await createSession(row.id, { ip: input.ip, userAgent: input.userAgent })

  await recordLogin({
    userId: row.id,
    email,
    ip: input.ip,
    userAgent: input.userAgent,
    success: true
  })

  return {
    user: {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.roleCode,
      status: row.status
    },
    permissions: row.permissions ?? []
  }
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const email = input.email.toLowerCase()

  if (input.password !== input.confirmPassword) {
    throw new ApiError(422, 'USER_PASSWORD_MISMATCH', '两次输入的密码不一致', {
      field: 'confirmPassword'
    })
  }

  if (!verifyCode(email, input.code)) {
    throw new ApiError(422, 'AUTH_CODE_INVALID', '验证码错误或已过期', { field: 'code' })
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (existing) {
    throw new ApiError(409, 'USER_EMAIL_TAKEN', '该邮箱已注册', { field: 'email' })
  }

  const passwordHash = await hashPassword(input.password)
  const [user] = await db
    .insert(users)
    .values({
      email,
      username: email.split('@')[0],
      passwordHash,
      roleCode: 'user',
      status: 'active'
    })
    .returning({ id: users.id, email: users.email, username: users.username })

  await createSession(user.id, { ip: input.ip, userAgent: input.userAgent })
  await recordLogin({ userId: user.id, email, success: true, reason: 'register' })

  return { user, permissions: [] }
}

/** 退出登录：删掉指定会话，并清掉客户端 cookie */
export async function logout(sessionId?: string) {
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
  }
  await destroySession()
}

// ── 邮箱验证码 / 找回密码 ───────────────────────────────────

export interface EmailCodeResult {
  sent: true
  expiresIn: number
  /** 仅 log provider 或未配置时返回，方便本地联调 */
  devCode?: string
}

/**
 * 发送登录/注册验证码。
 * 配置了真实 provider（Resend）→ 真发信且不回传 devCode；
 * log provider 或未配置 → 走日志并回传 devCode。
 */
export async function sendLoginCode(emailInput: string): Promise<EmailCodeResult> {
  const email = emailInput.toLowerCase()
  const code = issueCode(email)
  const provider = await resolveMailProvider()

  if (provider) {
    await sendMail(buildLoginCodeMessage(email, code), provider)
  }

  return exposesDevCode(provider)
    ? { sent: true, expiresIn: 600, devCode: code }
    : { sent: true, expiresIn: 600 }
}

/**
 * 申请重置密码验证码。
 * 无论邮箱是否存在都返回同样的成功响应（防枚举）；只有账号存在时才真正投递。
 */
export async function requestPasswordReset(emailInput: string): Promise<EmailCodeResult> {
  const email = emailInput.toLowerCase()
  const code = issueResetCode(email)

  const [user] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  const provider = await resolveMailProvider()
  if (provider && user && user.status !== 'disabled') {
    try {
      await sendMail(buildResetCodeMessage(email, code), provider)
    } catch (error) {
      // 不把投递失败暴露给调用方，避免通过错误差异枚举账号
      console.error('[auth] password reset mail failed', error)
    }
  }

  return exposesDevCode(provider)
    ? { sent: true, expiresIn: 600, devCode: code }
    : { sent: true, expiresIn: 600 }
}

export interface ResetPasswordInput {
  email: string
  code: string
  password: string
}

/** 校验重置码 → 改密码 → 吊销该用户全部会话 */
export async function resetPassword(input: ResetPasswordInput) {
  const email = input.email.toLowerCase()

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)

  if (!user || !verifyResetCode(email, input.code)) {
    throw new ApiError(422, 'AUTH_CODE_INVALID', '验证码错误或已过期', { field: 'code' })
  }

  const passwordHash = await hashPassword(input.password)

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id))
    // 密码已变更，旧会话全部失效（含可能被盗用的会话）
    await tx.delete(sessions).where(eq(sessions.userId, user.id))
  })

  await recordLogin({ userId: user.id, email, success: true, reason: 'password_reset' })

  return { ok: true as const }
}
