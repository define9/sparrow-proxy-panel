import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from 'node:crypto'
import { ApiError } from '@/lib/api/response'
import { safeEqualHex } from './sign'

/**
 * 节点密钥。
 *
 * 数据库只存一列 nodes.agent_secret_hash，但 HMAC 验签需要原始 secret，
 * 因此这一列按版本化的复合格式保存：
 *
 *   v1$<sha256(secret)>$<iv>$<tag>$<aes-256-gcm(secret)>
 *
 * - `sha256(secret)` 用于快速比对 / 判断是否已注册
 * - 密文用 MASTER_KEY 派生密钥（AES-256-GCM），保证落库不出现明文
 *
 * 对外接口保持简单：issueNodeSecret() 只返回一次明文，verify/load 走同一个解析器。
 */

const SECRET_PREFIX = 'v1'
const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000

function masterKey() {
  const raw = process.env.MASTER_KEY
  if (!raw) {
    throw new ApiError(500, 'INTERNAL_ERROR', '缺少 MASTER_KEY，无法启用节点密钥')
  }
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function hashSecret(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function generateNodeSecret() {
  return randomBytes(32).toString('hex')
}

export function sealSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    SECRET_PREFIX,
    hashSecret(secret),
    iv.toString('hex'),
    tag.toString('hex'),
    ciphertext.toString('hex')
  ].join('$')
}

export function openSecret(stored: string | null | undefined) {
  if (!stored) return null
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[0] !== SECRET_PREFIX) {
    // 兼容只存了裸 sha256 的历史行：无法反解，验签一律失败
    return null
  }
  const [, , ivHex, tagHex, ciphertextHex] = parts
  try {
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final()
    ])
    return plain.toString('utf8')
  } catch {
    return null
  }
}

/** 只比对 hash，不反解（用于「这个 secret 属于这个节点吗」） */
export function matchesSecret(stored: string | null | undefined, candidate: string) {
  if (!stored) return false
  const expected = stored.split('$')[1]
  if (!expected) return false
  return safeEqualHex(expected, hashSecret(candidate))
}

/**
 * 一次性注册令牌：base64(`<nodeId>.<expiresAt>.<hmac>`)
 * 由管理端「新建节点」时签发，Agent 首次注册时放在 X-Registration-Token。
 */
export function createRegistrationToken(nodeId: string) {
  const expiresAt = Date.now() + REGISTRATION_TTL_MS
  const payload = `${nodeId}.${expiresAt}`
  const signature = createHmac('sha256', masterKey()).update(payload, 'utf8').digest('hex')
  return Buffer.from(`${payload}.${signature}`, 'utf8').toString('base64')
}

export function parseRegistrationToken(token: string | null | undefined) {
  if (!token) {
    throw new ApiError(401, 'AGENT_SIGN_INVALID', '缺少 X-Registration-Token')
  }
  const decoded = Buffer.from(token, 'base64').toString('utf8')
  const parts = decoded.split('.')
  if (parts.length !== 3) {
    throw new ApiError(401, 'AGENT_SIGN_INVALID', '注册令牌格式不正确')
  }
  const [nodeId, expiresRaw, signature] = parts
  const expected = createHmac('sha256', masterKey())
    .update(`${nodeId}.${expiresRaw}`, 'utf8')
    .digest('hex')
  if (!safeEqualHex(expected, signature)) {
    throw new ApiError(401, 'AGENT_SIGN_INVALID', '注册令牌签名不正确')
  }
  if (!Number.isFinite(Number(expiresRaw)) || Number(expiresRaw) < Date.now()) {
    throw new ApiError(401, 'NODE_REG_TOKEN_EXPIRED', '注册令牌已过期，请重新生成')
  }
  return { nodeId }
}
