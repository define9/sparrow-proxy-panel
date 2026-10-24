/**
 * 插件熔断器。
 *
 * 规则（见 docs/architecture/plugin-system.md）：
 * - 同一插件连续 5 次调用失败 → 熔断 10 分钟，期间跳过调用
 * - 任意一次成功 → 失败计数清零
 *
 * 状态存在进程内存里：面板是多副本部署，熔断状态不跨副本共享（P1 可接受）。
 */

export interface CircuitBreakerOptions {
  /** 连续失败多少次后熔断，默认 5 */
  failureThreshold?: number
  /** 熔断持续时间（毫秒），默认 10 分钟 */
  openDurationMs?: number
  /** 时钟（测试可注入） */
  now?: () => number
}

export interface CircuitBreakerState {
  /** 连续失败次数 */
  failures: number
  /** 熔断截止时间戳，未熔断为 null */
  openUntil: number | null
}

export const DEFAULT_FAILURE_THRESHOLD = 5
export const DEFAULT_OPEN_DURATION_MS = 10 * 60 * 1000

export class PluginCircuitBreaker {
  private readonly threshold: number
  private readonly openDurationMs: number
  private readonly now: () => number
  private readonly states = new Map<string, CircuitBreakerState>()

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD
    this.openDurationMs = options.openDurationMs ?? DEFAULT_OPEN_DURATION_MS
    this.now = options.now ?? (() => Date.now())
  }

  /** 熔断是否生效（已过期的熔断会自动关闭） */
  isOpen(key: string): boolean {
    const state = this.states.get(key)
    if (!state || state.openUntil === null) {
      return false
    }
    if (this.now() >= state.openUntil) {
      this.states.set(key, { failures: 0, openUntil: null })
      return false
    }
    return true
  }

  /** 记录一次失败，达到阈值则熔断 */
  recordFailure(key: string): CircuitBreakerState {
    const current = this.states.get(key) ?? { failures: 0, openUntil: null }
    const failures = current.failures + 1
    const openUntil = failures >= this.threshold ? this.now() + this.openDurationMs : current.openUntil

    const state: CircuitBreakerState = { failures, openUntil }
    this.states.set(key, state)
    return state
  }

  /** 记录一次成功，清零失败计数 */
  recordSuccess(key: string): void {
    this.states.delete(key)
  }

  /** 当前状态（不触发过期判定） */
  getState(key: string): CircuitBreakerState {
    return this.states.get(key) ?? { failures: 0, openUntil: null }
  }

  /** 熔断剩余毫秒数（未熔断返回 0） */
  remainingMs(key: string): number {
    const state = this.states.get(key)
    if (!state || state.openUntil === null) {
      return 0
    }
    return Math.max(0, state.openUntil - this.now())
  }

  /** 重置（全部或单个插件） */
  reset(key?: string): void {
    if (key === undefined) {
      this.states.clear()
      return
    }
    this.states.delete(key)
  }
}
