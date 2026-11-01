import 'server-only'

interface CodeEntry {
  code: string
  expiresAt: number
  attempts: number
}

/** 验证码存进程内存（单机部署，重启即失效，安全上更安全） */
const store = new Map<string, CodeEntry>()

const TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

export function issueCode(email: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  store.set(email.toLowerCase(), { code, expiresAt: Date.now() + TTL_MS, attempts: 0 })
  return code
}

export function verifyCode(email: string, code: string) {
  const key = email.toLowerCase()
  const entry = store.get(key)
  if (!entry) return false
  if (entry.expiresAt < Date.now()) {
    store.delete(key)
    return false
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(key)
    return false
  }
  entry.attempts += 1
  if (entry.code !== code) return false
  store.delete(key)
  return true
}
