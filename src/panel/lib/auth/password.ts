import { hash, verify } from '@node-rs/argon2'

/** Argon2id，参数 m=64MB, t=3, p=1（与 docs/architecture/security.md 一致） */
const OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1
} as const

export function hashPassword(password: string) {
  return hash(password, OPTIONS)
}

export function verifyPassword(digest: string, password: string) {
  return verify(digest, password)
}
