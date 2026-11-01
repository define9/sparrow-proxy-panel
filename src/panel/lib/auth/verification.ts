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

/** 登录/注册码与找回密码码分命名空间，互不影响 */
type CodeScope = 'login' | 'reset'

function storeKey(scope: CodeScope, email: string) {
  return `${scope}:${email.toLowerCase()}`
}

function issue(scope: CodeScope, email: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  store.set(storeKey(scope, email), {
    code,
    expiresAt: Date.now() + TTL_MS,
    attempts: 0
  })
  return code
}

function verify(scope: CodeScope, email: string, code: string) {
  const key = storeKey(scope, email)
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

export function issueCode(email: string) {
  return issue('login', email)
}

export function verifyCode(email: string, code: string) {
  return verify('login', email, code)
}

export function issueResetCode(email: string) {
  return issue('reset', email)
}

export function verifyResetCode(email: string, code: string) {
  return verify('reset', email, code)
}
