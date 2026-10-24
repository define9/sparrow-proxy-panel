import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'

/**
 * 口令哈希：scrypt（N=16384, r=8, p=1），输出格式 `scrypt$N$r$p$salt$hash`
 *
 * 纯函数实现（不依赖 Nuxt 自动导入），因此 seed 脚本与运行时共用同一套逻辑。
 *
 * 注意：导出名刻意不叫 hashPassword / verifyPassword，
 * 以免与 nuxt-auth-utils 自带的同名工具冲突（Nuxt 自动导入会告警）。
 */
const KEY_LENGTH = 64
const COST = 16_384
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const MAX_MEM = 64 * 1024 * 1024

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }
      resolve(derivedKey)
    })
  })
}

export async function scryptHash(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEM
  })

  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64'),
    derived.toString('base64')
  ].join('$')
}

export async function scryptVerify(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const [, n, r, p, saltB64, hashB64] = parts
  const salt = Buffer.from(saltB64!, 'base64')
  const expected = Buffer.from(hashB64!, 'base64')

  const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM
  })

  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
