import { createHash } from 'node:crypto'
import type { PluginManifest } from '@sparrow/contracts'
import { PluginCircuitBreaker } from './circuit-breaker'
import { callExternalHook, resolvePluginEndpoint, resolvePluginToken } from './external'

/**
 * Hook 注册表与调用入口。
 *
 * 目录（契约 packages/contracts/src/domain/plugin.ts 的 PLUGIN_HOOKS）：
 * - 内置插件：进程内注册的 handler，同步 await
 * - 外置插件：HTTP 调用插件进程，失败不阻塞主流程，只记录
 *
 * 规则：
 * - 超时默认 3s（可按 hook 配置，最长 15s）
 * - 同一插件连续 5 次失败 → 熔断 10 分钟
 * - 每次调用写一条 plugin_events（hook / status / duration_ms / error / payload）
 */

export const DEFAULT_HOOK_TIMEOUT_MS = 3000
export const MAX_HOOK_TIMEOUT_MS = 15_000

export type HookStatus = 'success' | 'error' | 'timeout'

export interface HookCallContext {
  hook: string
  pluginId: string
  pluginKey: string
  manifest: PluginManifest
  config: Record<string, unknown>
}

/** 内置 hook 实现 */
export type HookHandler = (payload: unknown, context: HookCallContext) => unknown | Promise<unknown>

export interface HookRegistration {
  /** 插件 key（熔断与事件都按它归集） */
  pluginKey: string
  /** 插件 id（数据库 uuid），内置插件可省略 */
  pluginId?: string
  handler: HookHandler
  /** 该 hook 的超时（毫秒） */
  timeoutMs?: number
}

/** 插件调用目标（外置插件来自数据库） */
export interface HookPluginTarget {
  pluginId: string
  pluginKey: string
  runtime: 'builtin' | 'external'
  hooks: string[]
  manifest: PluginManifest
  config: Record<string, unknown>
  installedAt?: Date
}

/** 事件记录（对应 plugin_events 表） */
export interface HookEventRecord {
  pluginId: string
  pluginKey: string
  hook: string
  status: HookStatus
  durationMs: number
  error: string | null
  payload: Record<string, unknown>
}

/** 事件落库 */
export interface HookEventSink {
  record(event: HookEventRecord): void | Promise<void>
}

/** 目标来源：按 hook 取出需要调用的插件 */
export interface HookTargetStore {
  list(hook: string): Promise<HookPluginTarget[]>
}

export interface PluginHookHostOptions {
  /** 默认超时（毫秒），默认 3s */
  timeoutMs?: number
  /** 超时上限（毫秒），默认 15s */
  maxTimeoutMs?: number
  /** 连续失败多少次熔断，默认 5 */
  failureThreshold?: number
  /** 熔断时长（毫秒），默认 10 分钟 */
  openDurationMs?: number
  /** 熔断时钟（测试可注入） */
  now?: () => number
  /** 事件落库 */
  sink?: HookEventSink
  /** 插件目标来源 */
  store?: HookTargetStore
  /** 注入 fetch（测试外置插件用） */
  fetchImpl?: typeof fetch
}

export interface HookCallOptions {
  /** 排除的插件 key（例如回调入口要排除调用方自己） */
  exclude?: string[]
  /** 本次调用的超时覆盖 */
  timeoutMs?: number
}

export interface HookResultEntry {
  pluginKey: string
  pluginId: string
  status: HookStatus | 'skipped'
  durationMs: number
  data?: unknown
  error: string | null
  /** 跳过原因（当前只有熔断） */
  skipped?: 'circuit_open'
}

export interface HookCallResult {
  hook: string
  results: HookResultEntry[]
  /** 各插件返回值的合并结果（先返回的非空值优先） */
  data: Record<string, unknown>
  durationMs: number
}

/** 超时异常 */
export class HookTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`hook 调用超时（${timeoutMs}ms）`)
    this.name = 'HookTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/** 插件调用失败（外置插件返回错误 / 网络异常） */
export class PluginCallError extends Error {
  readonly timedOut: boolean

  constructor(message: string, timedOut = false) {
    super(message)
    this.name = 'PluginCallError'
    this.timedOut = timedOut
  }
}

/** 由插件 key 推导稳定的 uuid（内置插件没有数据库行时用作 plugin_events.plugin_id） */
export function pluginUuidFromKey(key: string): string {
  const hash = createHash('sha256').update(`sparrow:plugin:${key}`).digest('hex')
  const variant = ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16)

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-')
}

function toPayloadObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>
  }
  return { value: payload }
}

async function withTimeout<T>(
  run: () => T | Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new HookTimeoutError(timeoutMs)), timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve().then(run), timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

/**
 * 插件 Hook 宿主。
 *
 * 负责：注册表、调用编排、超时、熔断、事件落库。
 */
export class PluginHookHost {
  private readonly handlers = new Map<string, HookRegistration[]>()
  private readonly breaker: PluginCircuitBreaker
  private readonly defaultTimeoutMs: number
  private readonly maxTimeoutMs: number
  private readonly options: PluginHookHostOptions

  constructor(options: PluginHookHostOptions = {}) {
    this.options = options
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS
    this.maxTimeoutMs = options.maxTimeoutMs ?? MAX_HOOK_TIMEOUT_MS
    this.breaker = new PluginCircuitBreaker({
      failureThreshold: options.failureThreshold,
      openDurationMs: options.openDurationMs,
      now: options.now
    })
  }

  /** 熔断器（供健康度查询） */
  get circuitBreaker(): PluginCircuitBreaker {
    return this.breaker
  }

  /** 注册内置 hook 实现，返回注销函数 */
  register(hook: string, registration: HookRegistration): () => void {
    const list = this.handlers.get(hook) ?? []
    list.push(registration)
    this.handlers.set(hook, list)

    return () => this.unregister(hook, registration.pluginKey)
  }

  /** 注销某个插件在某个 hook 上的实现 */
  unregister(hook: string, pluginKey: string): void {
    const list = this.handlers.get(hook)
    if (!list) {
      return
    }
    const rest = list.filter(item => item.pluginKey !== pluginKey)
    if (rest.length) {
      this.handlers.set(hook, rest)
    } else {
      this.handlers.delete(hook)
    }
  }

  /** 清空所有内置注册 */
  clearRegistrations(): void {
    this.handlers.clear()
  }

  /** 查看某个 hook 的内置注册 */
  listRegistrations(hook: string): HookRegistration[] {
    return [...(this.handlers.get(hook) ?? [])]
  }

  /** 计算实际超时时间 */
  resolveTimeout(timeoutMs?: number): number {
    const value = timeoutMs ?? this.defaultTimeoutMs
    return Math.min(Math.max(value, 1), this.maxTimeoutMs)
  }

  /**
   * 调用 hook。
   *
   * 永不抛异常：单个插件失败只记录事件与熔断计数，不影响其它插件与主流程。
   */
  async callHook(
    hook: string,
    payload: unknown,
    options: HookCallOptions = {}
  ): Promise<HookCallResult> {
    const startedAt = Date.now()
    const exclude = new Set(options.exclude ?? [])
    const results: HookResultEntry[] = []
    const merged: Record<string, unknown> = {}

    for (const entry of await this.collectTargets(hook)) {
      const { target, handler } = entry

      if (exclude.has(target.pluginKey)) {
        continue
      }

      if (this.breaker.isOpen(target.pluginKey)) {
        results.push({
          pluginKey: target.pluginKey,
          pluginId: target.pluginId,
          status: 'skipped',
          durationMs: 0,
          error: '插件已熔断，暂时跳过调用',
          skipped: 'circuit_open'
        })
        continue
      }

      const outcome = await this.invoke(target, handler, hook, payload, options.timeoutMs)
      results.push(outcome.result)

      if (outcome.result.status === 'success') {
        this.breaker.recordSuccess(target.pluginKey)
      } else {
        this.breaker.recordFailure(target.pluginKey)
      }

      if (outcome.result.status === 'success' && outcome.result.data && typeof outcome.result.data === 'object' && !Array.isArray(outcome.result.data)) {
        for (const [key, value] of Object.entries(outcome.result.data as Record<string, unknown>)) {
          if (merged[key] === undefined) {
            merged[key] = value
          }
        }
      }
    }

    return {
      hook,
      results,
      data: merged,
      durationMs: Date.now() - startedAt
    }
  }

  /**
   * 收集需要调用的目标。
   *
   * - 配置了 store（生产）：只调用数据库里的插件；内置插件必须有对应的进程内实现
   * - 未配置 store（单测 / 本地）：直接调用进程内注册的实现
   */
  private async collectTargets(hook: string): Promise<Array<{ target: HookPluginTarget, handler?: HookHandler }>> {
    const entries: Array<{ target: HookPluginTarget, handler?: HookHandler }> = []
    const registrations = this.listRegistrations(hook)

    if (this.options.store) {
      const targets = await this.options.store.list(hook)

      for (const target of targets) {
        if (target.runtime === 'builtin') {
          const registration = registrations.find(item => item.pluginKey === target.pluginKey)
          if (!registration) {
            // 内置插件没有注册实现：跳过（不能因为插件装了就报错）
            continue
          }
          entries.push({ target, handler: registration.handler })
          continue
        }
        entries.push({ target })
      }

      return entries
    }

    for (const registration of registrations) {
      entries.push({
        target: {
          pluginId: registration.pluginId ?? pluginUuidFromKey(registration.pluginKey),
          pluginKey: registration.pluginKey,
          runtime: 'builtin',
          hooks: [hook],
          manifest: { key: registration.pluginKey } as PluginManifest,
          config: {}
        },
        handler: registration.handler
      })
    }

    return entries
  }

  /** 执行单次调用（含超时、事件落库） */
  private async invoke(
    target: HookPluginTarget,
    handler: HookHandler | undefined,
    hook: string,
    payload: unknown,
    timeoutOverride?: number
  ): Promise<{ result: HookResultEntry }> {
    const context: HookCallContext = {
      hook,
      pluginId: target.pluginId,
      pluginKey: target.pluginKey,
      manifest: target.manifest,
      config: target.config
    }
    const timeoutMs = this.resolveTimeout(timeoutOverride)
    const startedAt = Date.now()

    let status: HookStatus = 'success'
    let failure: string | null = null
    let data: unknown

    try {
      if (handler) {
        data = await withTimeout(() => handler(payload, context), timeoutMs)
      } else {
        const endpoint = resolvePluginEndpoint(target.manifest, target.config)
        const token = resolvePluginToken(target.config)

        if (!endpoint) {
          throw new PluginCallError('插件未配置进程地址')
        }

        const response = await withTimeout(
          () => callExternalHook(
            {
              pluginId: target.pluginId,
              pluginKey: target.pluginKey,
              endpoint,
              token: token ?? '',
              hooks: target.hooks,
              manifest: target.manifest,
              config: target.config
            },
            hook,
            payload,
            { timeoutMs, fetchImpl: this.options.fetchImpl }
          ),
          timeoutMs
        )

        if (!response.ok) {
          throw new PluginCallError(response.error ?? '插件调用失败', response.timedOut)
        }
        data = response.data
      }
    } catch (caught) {
      const err = caught as Error
      const timedOut = err instanceof HookTimeoutError
        || (err instanceof PluginCallError && err.timedOut)
      status = timedOut ? 'timeout' : 'error'
      failure = err?.message ?? String(caught)
    }

    const durationMs = Date.now() - startedAt

    await this.writeEvent({
      pluginId: target.pluginId,
      pluginKey: target.pluginKey,
      hook,
      status,
      durationMs,
      error: failure,
      payload: toPayloadObject(payload)
    })

    return {
      result: {
        pluginKey: target.pluginKey,
        pluginId: target.pluginId,
        status,
        durationMs,
        data,
        error: failure
      }
    }
  }

  /** 手动记录一条事件（例如插件回调入口） */
  async recordEvent(
    event: Omit<HookEventRecord, 'durationMs'> & { durationMs?: number }
  ): Promise<void> {
    await this.writeEvent({
      ...event,
      durationMs: event.durationMs ?? 0
    })
  }

  /** 写事件（失败不影响主流程） */
  private async writeEvent(event: HookEventRecord): Promise<void> {
    if (!this.options.sink) {
      return
    }
    try {
      await this.options.sink.record(event)
    } catch (error) {
      console.error('[plugin] 写入 plugin_events 失败：', (error as Error).message)
    }
  }
}
