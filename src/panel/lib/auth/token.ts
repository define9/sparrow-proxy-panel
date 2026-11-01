import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { personalAccessTokens, roles, users } from '@/lib/db/schema'
import type { Session } from '@/lib/auth/types'

/**
 * PAT（personal access token）鉴权：`Authorization: Bearer spx_xxx`。
 *
 * 与 cookie 会话是两套路径：
 * - 只读凭据，库里只存 sha256(token)，鉴权时同样只比对摘要；
 * - 命中后返回与 getSession() 同形状的 Session（外加 scope），
 *   由调用方（guard.requireUserApi）做 scope 校验，本文件不决定 401/403。
 * - 不接受 query 参数、cookie、表单里的 token：只认 Authorization 头，
 *   否则 token 会顺着访问日志 / Referer 泄漏。
 */

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i

/** last_used_at 节流窗口：同一 token 60 秒内只写一次库，避免每个请求一次 update */
const LAST_USED_THROTTLE_MS = 60_000

export interface AccessTokenContext {
  /**
   * 与 getSession() 同形状。PAT 没有浏览器会话，
   * `sessionId` 位置放 token id，仅作凭据标识（PAT 不参与会话管理接口）。
   */
  session: Session
  scopes: string[]
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

/** 只从 `Authorization: Bearer <token>` 取；scheme 大小写不敏感，其它位置一律忽略 */
export function readBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const match = BEARER_PATTERN.exec(header.trim())
  return match?.[1] ?? null
}

/**
 * 校验 Bearer token → 返回会话与 scope。
 * token 不存在 / 已吊销 / 已过期 / 用户非 active 一律返回 null（调用方统一 401，避免枚举）。
 */
export async function resolveAccessToken(req: Request): Promise<AccessTokenContext | null> {
  const token = readBearerToken(req)
  if (!token) return null

  const now = new Date()
  const rows = await db
    .select({
      tokenId: personalAccessTokens.id,
      scopes: personalAccessTokens.scopes,
      lastUsedAt: personalAccessTokens.lastUsedAt,
      userId: users.id,
      email: users.email,
      username: users.username,
      roleCode: users.roleCode,
      status: users.status,
      balance: users.balance,
      permissions: roles.permissions
    })
    .from(personalAccessTokens)
    .innerJoin(users, eq(users.id, personalAccessTokens.userId))
    .leftJoin(roles, eq(roles.code, users.roleCode))
    .where(
      and(
        eq(personalAccessTokens.tokenHash, sha256(token)),
        isNull(personalAccessTokens.revokedAt),
        or(isNull(personalAccessTokens.expiresAt), gt(personalAccessTokens.expiresAt, now))
      )
    )
    .limit(1)

  const row = rows[0]
  if (!row || row.status !== 'active') return null

  // 节流写 last_used_at：只为「最近使用」展示服务，不值得每个请求都更新一行
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    try {
      await db
        .update(personalAccessTokens)
        .set({ lastUsedAt: now })
        .where(eq(personalAccessTokens.id, row.tokenId))
    } catch (error) {
      // 使用时间写失败不影响本次请求
      console.error('[auth] failed to update token last_used_at', error)
    }
  }

  return {
    scopes: row.scopes ?? [],
    session: {
      sessionId: row.tokenId,
      user: {
        id: row.userId,
        email: row.email,
        username: row.username,
        role: row.roleCode,
        status: row.status,
        balance: row.balance
      },
      permissions: row.permissions ?? []
    }
  }
}
