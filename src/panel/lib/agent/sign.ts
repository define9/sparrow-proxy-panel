import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Agent HMAC 签名（与 docs/architecture/api-design.md §2.2 一致）。
 *
 * canonical = METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(body)
 * signature = hex(HMAC-SHA256(secret, canonical))
 *
 * 约定：
 * - METHOD 用大写；PATH 只取 pathname（不含 query，不含 origin）
 * - body 用原始字节做 sha256 的 hex；GET / 空 body 时是空串的 sha256
 * - TIMESTAMP 是 Unix 毫秒时间戳的十进制字符串
 *
 * 测试向量见同目录 sign.test.ts（`node --import tsx lib/agent/sign.test.ts`）。
 */

export const SIGN_WINDOW_MS = 5 * 60 * 1000
export const NONCE_TTL_MS = 10 * 60 * 1000

/** sha256('') —— Agent 的空 body（GET）固定哈希 */
export const SHA256_EMPTY_BODY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export interface SignInput {
  method: string
  path: string
  timestamp: string | number
  nonce: string
  body?: string | Buffer | null
}

export function sha256Hex(body: string | Buffer | null | undefined) {
  return createHash('sha256')
    .update(body ?? '')
    .digest('hex')
}

export function buildCanonicalString(input: SignInput) {
  return [
    input.method.toUpperCase(),
    input.path,
    String(input.timestamp),
    input.nonce,
    sha256Hex(input.body)
  ].join('\n')
}

export function signRequest(secret: string, input: SignInput) {
  return createHmac('sha256', secret)
    .update(buildCanonicalString(input), 'utf8')
    .digest('hex')
}

/** hex 常量时间比较（长度不同直接 false，避免 timingSafeEqual 抛错） */
export function safeEqualHex(expected: string, actual: string) {
  if (typeof actual !== 'string' || expected.length !== actual.length) return false
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(actual, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * nonce 去重（进程内 Map + TTL）。
 * key 建议 `nodeId:nonce`，10 分钟内同 key 二次出现即视为重放。
 */
const nonceStore = new Map<string, number>()

function pruneNonceStore(now: number) {
  if (nonceStore.size < 1024) return
  for (const [key, expiresAt] of nonceStore) {
    if (expiresAt <= now) nonceStore.delete(key)
  }
}

/** 首次使用返回 true；重放返回 false */
export function consumeNonce(key: string, now = Date.now()) {
  pruneNonceStore(now)
  const existing = nonceStore.get(key)
  if (existing !== undefined && existing > now) return false
  nonceStore.set(key, now + NONCE_TTL_MS)
  return true
}

/** 仅供测试使用 */
export function resetNonceStore() {
  nonceStore.clear()
}
