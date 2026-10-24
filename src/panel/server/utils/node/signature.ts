import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 节点（Agent）请求签名。
 *
 * 面板与 Agent 之间的 HMAC 签名协议，**canonical 必须逐字节一致**：
 *
 * ```
 * METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
 * ```
 *
 * - METHOD：大写，如 `GET` / `POST`
 * - PATH：URL 路径部分，**不含 query string**（如 `/api/v1/agent/config`）
 * - TIMESTAMP：请求头 `X-Timestamp` 的**原始字符串**（Unix 毫秒）
 * - NONCE：请求头 `X-Nonce` 的原始字符串
 * - SHA256(body)：请求体的 SHA-256 十六进制小写；空体为
 *   `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
 *
 * 签名：`HMAC-SHA256(secret, canonical)` 的十六进制小写。
 *
 * 固定测试向量见 `src/panel/tests/node/signature.test.ts`，Go 端需使用同一组向量。
 */

/** 请求头名（小写，h3 读取时统一小写） */
export const SIGNATURE_HEADERS = {
  nodeId: 'x-node-id',
  timestamp: 'x-timestamp',
  nonce: 'x-nonce',
  signature: 'x-signature'
} as const

/** 时间偏差上限：5 分钟 */
export const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000

/** nonce 保留时长：10 分钟（覆盖时间偏差窗口，避免重放） */
export const SIGNATURE_NONCE_TTL_MS = 10 * 60 * 1000

/** 失败原因（与契约 ERROR_CODES 对齐） */
export const SIGNATURE_ERROR_CODES = {
  invalid: 'AGENT_SIGN_INVALID',
  skew: 'AGENT_TIMESTAMP_SKEW',
  replay: 'AGENT_NONCE_REPLAY'
} as const

export type SignatureErrorCode = (typeof SIGNATURE_ERROR_CODES)[keyof typeof SIGNATURE_ERROR_CODES]

/** 计算请求体的 SHA-256（十六进制小写） */
export function hashBody(body?: string | Uint8Array | null): string {
  return createHash('sha256')
    .update(body ?? '', 'utf8')
    .digest('hex')
}

/**
 * 归一化路径：去掉 query / fragment，只保留路径部分。
 *
 * 统一以 `/` 开头，避免签名双方对相对路径的处理差异。
 */
export function normalizePath(path: string): string {
  const withoutQuery = (path ?? '').split('?')[0]!.split('#')[0]!
  if (!withoutQuery) {
    return '/'
  }
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`
}

export interface CanonicalInput {
  /** HTTP 方法，大小写不敏感 */
  method: string
  /** URL 路径（含 query 也会被裁掉） */
  path: string
  /** 时间戳字符串（原始值参与 canonical） */
  timestamp: string
  /** 随机串 */
  nonce: string
  /** 请求体 */
  body?: string | Uint8Array | null
}

/** 构造 canonical 字符串 */
export function buildCanonicalString(input: CanonicalInput): string {
  return [
    (input.method ?? '').toUpperCase(),
    normalizePath(input.path),
    String(input.timestamp ?? ''),
    String(input.nonce ?? ''),
    hashBody(input.body)
  ].join('\n')
}

export interface SignatureInput extends CanonicalInput {
  /** 节点密钥 */
  secret: string
}

/** 计算签名（十六进制小写） */
export function buildSignature(input: SignatureInput): string {
  const canonical = buildCanonicalString(input)
  return createHmac('sha256', input.secret).update(canonical, 'utf8').digest('hex')
}

/**
 * nonce 存储：进程内存 Map + TTL（单机部署，不引入 Redis）。
 *
 * 单机单实例下足够；多副本部署需要替换为共享存储（收敛在本文件内）。
 */
export interface NonceStore {
  /**
   * 登记 nonce。
   *
   * @param key 通常为 `${nodeId}:${nonce}`
   * @param now 当前时间（毫秒），用于过期判断（便于测试注入）
   * @returns `false` 表示该 nonce 已被使用（重放）
   */
  remember(key: string, now: number): boolean
  /** 是否已使用（不写入） */
  has(key: string, now: number): boolean
  /** 清理过期条目 */
  prune(now: number): void
  /** 清空 */
  clear(): void
  /** 当前条目数（含未过期） */
  readonly size: number
}

/** 创建 nonce 存储 */
export function createNonceStore(ttlMs: number = SIGNATURE_NONCE_TTL_MS): NonceStore {
  const store = new Map<string, number>()

  const prune = (now: number) => {
    for (const [key, expiresAt] of store) {
      if (expiresAt <= now) {
        store.delete(key)
      }
    }
  }

  return {
    remember(key, now) {
      prune(now)
      if (store.has(key)) {
        return false
      }
      store.set(key, now + ttlMs)
      return true
    },
    has(key, now) {
      const expiresAt = store.get(key)
      if (expiresAt === undefined) {
        return false
      }
      if (expiresAt <= now) {
        store.delete(key)
        return false
      }
      return true
    },
    prune,
    clear() {
      store.clear()
    },
    get size() {
      return store.size
    }
  }
}

/** 进程级默认 nonce 存储（单例） */
export const defaultNonceStore: NonceStore = createNonceStore()

export interface VerifySignatureInput {
  secret: string
  method: string
  path: string
  timestamp: string
  nonce: string
  /** 客户端给出的签名（十六进制小写） */
  signature: string
  body?: string | Uint8Array | null
  /** 当前时间（毫秒），测试可注入 */
  now?: number
  /** nonce 存储，缺省使用进程级单例 */
  nonceStore?: NonceStore
  /** 节点 ID（用于 nonce 隔离，缺省用 `anonymous`） */
  nodeId?: string
  /** 是否登记 nonce，默认 true；重复校验同一请求时可关闭 */
  consumeNonce?: boolean
}

/** 验签成功 */
export interface VerifySignatureSuccess {
  ok: true
}

/** 验签失败 */
export interface VerifySignatureFailure {
  ok: false
  code: SignatureErrorCode
  message: string
}

export type VerifySignatureResult = VerifySignatureSuccess | VerifySignatureFailure

/**
 * 解析时间戳。
 *
 * 契约约定为 Unix **毫秒**；为兼容 Unix 秒（10 位）做一次兜底换算，
 * 但 canonical 始终使用请求头里的原始字符串。
 */
export function parseTimestamp(raw: string): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }
  // 10 位及以下视为秒
  return value < 100_000_000_000 ? value * 1000 : value
}

/** 常量时间比较两个十六进制字符串 */
export function safeCompareHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  if (left.length === 0 || left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}

/**
 * 校验节点请求签名。
 *
 * 校验顺序（安全考虑）：
 * 1. 时间偏差（≤ 5 分钟）
 * 2. 签名常量时间比较
 * 3. nonce 防重放（**验签通过之后**才登记，避免被攻击者烧掉 nonce）
 */
export function verifySignature(input: VerifySignatureInput): VerifySignatureResult {
  const now = input.now ?? Date.now()

  const timestamp = parseTimestamp(input.timestamp)
  if (timestamp === null) {
    return {
      ok: false,
      code: SIGNATURE_ERROR_CODES.invalid,
      message: '时间戳非法'
    }
  }

  if (Math.abs(now - timestamp) > SIGNATURE_MAX_SKEW_MS) {
    return {
      ok: false,
      code: SIGNATURE_ERROR_CODES.skew,
      message: '时间戳偏差超过 5 分钟'
    }
  }

  const expected = buildSignature({
    secret: input.secret,
    method: input.method,
    path: input.path,
    timestamp: input.timestamp,
    nonce: input.nonce,
    body: input.body
  })

  if (!safeCompareHex(expected, String(input.signature ?? '').toLowerCase())) {
    return {
      ok: false,
      code: SIGNATURE_ERROR_CODES.invalid,
      message: '签名校验失败'
    }
  }

  if (input.consumeNonce !== false) {
    const store = input.nonceStore ?? defaultNonceStore
    const key = `${input.nodeId ?? 'anonymous'}:${input.nonce}`
    if (!store.remember(key, now)) {
      return {
        ok: false,
        code: SIGNATURE_ERROR_CODES.replay,
        message: 'nonce 已被使用（重放请求）'
      }
    }
  }

  return { ok: true }
}
