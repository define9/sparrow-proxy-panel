import { createHmac } from 'node:crypto'
import type { PluginManifest } from '@sparrow/contracts'

/**
 * 外置插件调用。
 *
 * 协议（见 docs/architecture/plugin-system.md）：
 *   面板 ──HTTP POST──►  插件进程  /hook/{hookName}
 *
 * 请求头：
 *   Authorization: Bearer <plugin_token>
 *   X-Sparrow-Plugin: <plugin_key>
 *   X-Sparrow-Signature: HMAC-SHA256(<plugin_token>, body)
 *
 * 外置插件失败不阻塞主流程：这里只返回结果，由调用方记录事件。
 */

export const DEFAULT_EXTERNAL_TIMEOUT_MS = 3000
export const MAX_EXTERNAL_TIMEOUT_MS = 15_000

export interface ExternalHookCallOptions {
  /** 超时（毫秒），默认 3s，最长 15s */
  timeoutMs?: number
  /** 注入 fetch（测试用） */
  fetchImpl?: typeof fetch
  /** 是否附带 HMAC 签名，默认 true */
  sign?: boolean
}

export interface ExternalHookResult {
  ok: boolean
  /** HTTP 状态码（网络异常时为 0） */
  status: number
  /** 插件返回的数据 */
  data: unknown
  /** 失败原因 */
  error: string | null
  /** 是否超时 */
  timedOut: boolean
  durationMs: number
}

/** 外置插件的调用目标 */
export interface ExternalPluginTarget {
  pluginId: string
  pluginKey: string
  /** 插件进程地址 */
  endpoint: string
  /** 插件 token（面板 → 插件 与 插件 → 面板 共用同一个） */
  token: string
  /** 插件声明的扩展点 */
  hooks: string[]
  manifest: PluginManifest
  config: Record<string, unknown>
}

/** 计算实际超时（默认 3s，上限 15s） */
export function resolveTimeoutMs(timeoutMs?: number): number {
  const value = timeoutMs ?? DEFAULT_EXTERNAL_TIMEOUT_MS
  return Math.min(Math.max(value, 1), MAX_EXTERNAL_TIMEOUT_MS)
}

/**
 * 解析插件进程地址。
 *
 * 优先取配置里的 endpoint / baseUrl，其次用 manifest.entry。
 */
export function resolvePluginEndpoint(
  manifest: Pick<PluginManifest, 'entry'>,
  config: Record<string, unknown>
): string | null {
  const candidates = [config.endpoint, config.baseUrl, config.url, manifest.entry]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

/**
 * 解析插件 token。
 *
 * token 存在插件配置里（保留键 __plugin_token），配置项 token / pluginToken 也兼容。
 */
export function resolvePluginToken(config: Record<string, unknown>): string | null {
  const candidates = [config.__plugin_token, config.token, config.pluginToken]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

/** 计算请求体签名：HMAC-SHA256(token, body) */
export function signPayload(token: string, body: string): string {
  return createHmac('sha256', token).update(body).digest('hex')
}

/** 拼接 hook 调用地址 */
export function buildHookUrl(endpoint: string, hook: string): string {
  const base = endpoint.replace(/\/+$/, '')
  return `${base}/hook/${encodeURIComponent(hook)}`
}

/**
 * 调用外置插件的 hook。
 *
 * 永不抛异常：网络错误 / 超时都通过返回值表达。
 */
export async function callExternalHook(
  target: ExternalPluginTarget,
  hook: string,
  payload: unknown,
  options: ExternalHookCallOptions = {}
): Promise<ExternalHookResult> {
  const startedAt = Date.now()
  const timeoutMs = resolveTimeoutMs(options.timeoutMs)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (!target.endpoint) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: '插件未配置进程地址',
      timedOut: false,
      durationMs: 0
    }
  }

  const body = JSON.stringify(payload ?? {})
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${target.token}`,
    'X-Sparrow-Plugin': target.pluginKey
  }

  if (options.sign !== false && target.token) {
    headers['X-Sparrow-Signature'] = signPayload(target.token, body)
  }

  try {
    const response = await fetchImpl(buildHookUrl(target.endpoint, hook), {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs)
    })

    const durationMs = Date.now() - startedAt
    const contentType = response.headers.get('content-type') ?? ''
    let data: unknown = null

    if (contentType.includes('json')) {
      data = await response.json().catch(() => null)
    } else {
      data = await response.text().catch(() => '')
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: `插件返回 HTTP ${response.status}`,
        timedOut: false,
        durationMs
      }
    }

    return { ok: true, status: response.status, data, error: null, timedOut: false, durationMs }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : String(error)
    const timedOut = /timeout|aborted/i.test(message)

    return {
      ok: false,
      status: 0,
      data: null,
      error: timedOut ? `插件调用超时（${timeoutMs}ms）` : message,
      timedOut,
      durationMs
    }
  }
}
