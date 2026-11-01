import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * plugins.config 里 secret 字段的落库加解密。
 *
 * 格式：v1$<iv>$<tag>$<aes-256-gcm(明文)>，密钥由 MASTER_KEY 派生（SHA-256）。
 * 与 lib/agent/secret.ts 同一套算法，但插件配置只需要「能解回来用」，不需要 hash 列。
 *
 * 约束：MASTER_KEY 丢失 = 密钥无法恢复，只能重新填；见 docs/architecture/security.md。
 */

const PREFIX = 'v1'

function masterKey(): Buffer {
  const raw = process.env.MASTER_KEY
  if (!raw) throw new Error('缺少 MASTER_KEY，无法加解密插件密钥')
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function isSealedSecret(value: string): boolean {
  const parts = value.split('$')
  return parts.length === 4 && parts[0] === PREFIX
}

export function sealPluginSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const parts = [PREFIX, iv.toString('hex'), cipher.getAuthTag().toString('hex'), body.toString('hex')]
  return parts.join('$')
}

/** 解不开（换过 MASTER_KEY / 历史明文）时返回空串：调用方按「未配置」处理 */
export function openPluginSecret(stored: string): string {
  if (!stored) return ''
  if (!isSealedSecret(stored)) return stored

  const [, ivHex, tagHex, bodyHex] = stored.split('$')
  try {
    const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const plain = Buffer.concat([
      decipher.update(Buffer.from(bodyHex, 'hex')),
      decipher.final()
    ])
    return plain.toString('utf8')
  } catch {
    return ''
  }
}
