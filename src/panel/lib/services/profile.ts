import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { personalAccessTokens, sessions, users } from '@/lib/db/schema'
import { ApiError } from '@/lib/api/response'
import { writeAudit } from '@/lib/api/audit'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import type { ProfileDto, SessionDto, TokenCreatedDto, TokenDto } from '@/lib/api/types'
import { TOKEN_SCOPES, type TokenScope } from '@/lib/api/types'

/**
 * 用户自助域服务层：个人资料 / 改密 / 登录设备 / API Token。
 *
 * 入参只有 userId（由 route 从会话里取），出参是 DTO；
 * 永远不返回 password_hash / twofa_secret / token_hash。
 */

type UserRow = typeof users.$inferSelect
type TokenRow = typeof personalAccessTokens.$inferSelect
type SessionRow = typeof sessions.$inferSelect

function toProfile(row: UserRow): ProfileDto {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    telegramId: row.telegramId,
    roleCode: row.roleCode,
    twoFactorEnabled: row.twofaEnabled,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null
  }
}

function toSession(row: SessionRow, currentSessionId?: string): SessionDto {
  return {
    id: row.id,
    ip: row.ip,
    userAgent: row.userAgent,
    current: row.id === currentSessionId,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString()
  }
}

function toToken(row: TokenRow): TokenDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.tokenPrefix,
    scopes: row.scopes,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null
  }
}

/** pg 唯一约束冲突（并发改名时兜底 409，而不是 500） */
function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

// ── 个人资料 ─────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<ProfileDto> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')
  return toProfile(row)
}

export interface UpdateProfileInput {
  username?: string
  telegramId?: string | null
}

/**
 * 邮箱是登录凭证，接口层不接受修改；用户名唯一（大小写不敏感）。
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  ip?: string | null
): Promise<ProfileDto> {
  const [current] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  const patch: Partial<typeof users.$inferInsert> = {}

  if (input.username !== undefined && input.username !== current.username) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = ${input.username.toLowerCase()}`, ne(users.id, userId)))
      .limit(1)

    if (taken) {
      throw new ApiError(409, 'USER_USERNAME_TAKEN', '该用户名已被占用', { field: 'username' })
    }
    patch.username = input.username
  }

  if (input.telegramId !== undefined) {
    const telegramId = input.telegramId?.trim() || null
    if (telegramId !== (current.telegramId ?? null)) patch.telegramId = telegramId
  }

  if (Object.keys(patch).length === 0) return toProfile(current)

  let updated: UserRow
  try {
    ;[updated] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'USER_USERNAME_TAKEN', '该用户名已被占用', { field: 'username' })
    }
    throw error
  }

  await writeAudit(
    { id: userId, label: current.email, ip: ip ?? null },
    {
      action: 'user.profile.update',
      targetType: 'user',
      targetId: userId,
      message: `更新个人资料：${Object.keys(patch).join(', ')}`,
      meta: { changes: Object.keys(patch) }
    }
  )

  return toProfile(updated)
}

// ── 修改密码 ─────────────────────────────────────────────────

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

/**
 * 校验旧密码 → 换新密码 → 吊销该用户除当前会话外的全部会话。
 * 与「找回密码」一致，改密成功后旧设备必须重新登录。
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
  ip?: string | null
): Promise<{ ok: true }> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在')

  const valid = await verifyPassword(row.passwordHash, input.currentPassword)
  if (!valid) {
    throw new ApiError(422, 'AUTH_INVALID_CREDENTIALS', '当前密码不正确', {
      field: 'currentPassword'
    })
  }

  if (input.newPassword === input.currentPassword) {
    throw new ApiError(422, 'AUTH_PASSWORD_UNCHANGED', '新密码不能与当前密码相同', {
      field: 'newPassword'
    })
  }

  const passwordHash = await hashPassword(input.newPassword)

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))

    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)))
  })

  await writeAudit(
    { id: userId, label: row.email, ip: ip ?? null },
    {
      action: 'user.password.change',
      targetType: 'user',
      targetId: userId,
      message: '用户自助修改密码，已吊销其他会话'
    }
  )

  return { ok: true as const }
}

// ── 登录设备 ─────────────────────────────────────────────────

export async function listSessions(userId: string, currentSessionId?: string): Promise<SessionDto[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt))

  return rows.map((row) => toSession(row, currentSessionId))
}

/** 只能吊销自己的会话；吊销当前会话等同于登出（route 负责清 cookie） */
export async function revokeSession(
  userId: string,
  sessionId: string,
  meta?: { email?: string | null; ip?: string | null }
): Promise<void> {
  const [row] = await db
    .select({ id: sessions.id, ip: sessions.ip })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1)

  if (!row) throw new ApiError(404, 'SESSION_NOT_FOUND', '会话不存在或已失效')

  await db.delete(sessions).where(eq(sessions.id, sessionId))

  await writeAudit(
    { id: userId, label: meta?.email ?? null, ip: meta?.ip ?? null },
    {
      action: 'user.session.revoke',
      targetType: 'session',
      targetId: sessionId,
      message: `吊销自己的登录会话（IP ${row.ip ?? '未知'}）`,
      meta: { sessionId }
    }
  )
}

// ── API Token ────────────────────────────────────────────────

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function listTokens(userId: string): Promise<TokenDto[]> {
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, userId))
    .orderBy(desc(personalAccessTokens.createdAt))

  return rows.map(toToken)
}

export interface CreateTokenInput {
  name: string
  scopes?: string[]
  expiresInDays?: number | null
}

/**
 * 明文只在创建时返回一次；库里只存 sha256 与可读前缀。
 * scopes 只允许契约里声明的值，避免前端随手传任意权限点。
 */
export async function createToken(
  userId: string,
  input: CreateTokenInput,
  ip?: string | null
): Promise<TokenCreatedDto> {
  const scopes = input.scopes ?? []
  const invalid = scopes.filter((scope) => !TOKEN_SCOPES.includes(scope as TokenScope))
  if (invalid.length > 0) {
    throw new ApiError(422, 'VALIDATION_FAILED', `不支持的 scope：${invalid.join(', ')}`, {
      field: 'scopes'
    })
  }

  const token = `spx_${randomBytes(24).toString('hex')}`
  const [row] = await db
    .insert(personalAccessTokens)
    .values({
      userId,
      name: input.name,
      tokenPrefix: `${token.slice(0, 16)}…`,
      tokenHash: sha256(token),
      scopes,
      expiresAt:
        input.expiresInDays && input.expiresInDays > 0
          ? new Date(Date.now() + input.expiresInDays * 86_400_000)
          : null
    })
    .returning()

  await writeAudit(
    { id: userId, label: null, ip: ip ?? null },
    {
      action: 'user.token.create',
      targetType: 'personal_access_token',
      targetId: row.id,
      message: `创建 API Token「${row.name}」`,
      meta: { scopes, expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null }
    }
  )

  return { ...toToken(row), token }
}

/** 吊销（幂等）：已吊销的直接返回成功，避免前端重复点击报 404 */
export async function revokeToken(
  userId: string,
  id: string,
  meta?: { email?: string | null; ip?: string | null }
): Promise<void> {
  const [row] = await db
    .select({ id: personalAccessTokens.id, name: personalAccessTokens.name })
    .from(personalAccessTokens)
    .where(and(eq(personalAccessTokens.id, id), eq(personalAccessTokens.userId, userId)))
    .limit(1)

  if (!row) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'Token 不存在')

  await db
    .update(personalAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(personalAccessTokens.id, id), sql`${personalAccessTokens.revokedAt} is null`))

  await writeAudit(
    { id: userId, label: meta?.email ?? null, ip: meta?.ip ?? null },
    {
      action: 'user.token.revoke',
      targetType: 'personal_access_token',
      targetId: id,
      message: `吊销 API Token「${row.name}」`
    }
  )
}
