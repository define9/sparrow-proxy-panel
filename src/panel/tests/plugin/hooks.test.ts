import { describe, expect, it } from 'vitest'
import { PluginHookHost } from '../../server/utils/plugin-host/hooks'
import type { HookEventRecord, HookEventSink } from '../../server/utils/plugin-host/hooks'

/**
 * Hook 注册表：超时、熔断、事件落库。
 */

function createHost(options: Partial<ConstructorParameters<typeof PluginHookHost>[0]> = {}) {
  const events: HookEventRecord[] = []
  const sink: HookEventSink = {
    record(event) {
      events.push(event)
    }
  }
  const host = new PluginHookHost({ sink, ...options })

  return { host, events }
}

describe('hook 调用', () => {
  it('调用已注册的内置 hook 并写事件', async () => {
    const { host, events } = createHost()

    host.register('notification.send', {
      pluginKey: 'demo-notifier',
      handler: async payload => ({ delivered: true, payload })
    })

    const result = await host.callHook('notification.send', { channel: 'webhook' })

    expect(result.hook).toBe('notification.send')
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.status).toBe('success')
    expect(result.results[0]?.pluginKey).toBe('demo-notifier')
    expect(result.data).toEqual({ delivered: true, payload: { channel: 'webhook' } })

    expect(events).toHaveLength(1)
    expect(events[0]?.hook).toBe('notification.send')
    expect(events[0]?.status).toBe('success')
    expect(events[0]?.error).toBeNull()
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(events[0]?.payload).toEqual({ channel: 'webhook' })
  })

  it('未注册任何实现时不报错', async () => {
    const { host, events } = createHost()

    const result = await host.callHook('notification.send', {})

    expect(result.results).toEqual([])
    expect(result.data).toEqual({})
    expect(events).toHaveLength(0)
  })

  it('超时记为 timeout 并继续主流程', async () => {
    const { host, events } = createHost({ timeoutMs: 50 })

    host.register('notification.send', {
      pluginKey: 'slow-plugin',
      handler: () => new Promise(resolve => setTimeout(() => resolve('late'), 1000))
    })

    const result = await host.callHook('notification.send', { channel: 'webhook' })

    expect(result.results[0]?.status).toBe('timeout')
    expect(result.results[0]?.error).toContain('超时')
    expect(events[0]?.status).toBe('timeout')
  })

  it('默认超时 3s，最长 15s', () => {
    const host = new PluginHookHost()

    expect(host.resolveTimeout()).toBe(3000)
    expect(host.resolveTimeout(1000)).toBe(1000)
    expect(host.resolveTimeout(60_000)).toBe(15_000)
  })

  it('抛错的实现记为 error', async () => {
    const { host, events } = createHost()

    host.register('notification.send', {
      pluginKey: 'broken-plugin',
      handler: () => {
        throw new Error('boom')
      }
    })

    const result = await host.callHook('notification.send', {})

    expect(result.results[0]?.status).toBe('error')
    expect(result.results[0]?.error).toBe('boom')
    expect(events[0]?.status).toBe('error')
  })

  it('exclude 的插件不会被调用', async () => {
    const { host } = createHost()

    host.register('notification.send', {
      pluginKey: 'demo-notifier',
      handler: () => ({ delivered: true })
    })

    const result = await host.callHook('notification.send', {}, { exclude: ['demo-notifier'] })

    expect(result.results).toEqual([])
  })
})

describe('熔断', () => {
  it('连续 5 次失败后熔断 10 分钟', async () => {
    let now = 1_000_000
    const { host, events } = createHost({
      now: () => now,
      failureThreshold: 5,
      openDurationMs: 10 * 60 * 1000
    })

    host.register('notification.send', {
      pluginKey: 'bad-plugin',
      handler: () => {
        throw new Error('boom')
      }
    })

    for (let i = 0; i < 5; i++) {
      const result = await host.callHook('notification.send', {})
      expect(result.results[0]?.status).toBe('error')
    }

    expect(host.circuitBreaker.isOpen('bad-plugin')).toBe(true)
    expect(host.circuitBreaker.getState('bad-plugin').failures).toBe(5)
    expect(events).toHaveLength(5)

    // 熔断期间跳过调用，且不再写事件
    const skipped = await host.callHook('notification.send', {})
    expect(skipped.results[0]?.status).toBe('skipped')
    expect(skipped.results[0]?.skipped).toBe('circuit_open')
    expect(events).toHaveLength(5)

    // 熔断窗口内仍然跳过
    now += 9 * 60 * 1000
    expect(host.circuitBreaker.isOpen('bad-plugin')).toBe(true)

    // 10 分钟后自动恢复
    now += 60 * 1000 + 1
    expect(host.circuitBreaker.isOpen('bad-plugin')).toBe(false)

    const recovered = await host.callHook('notification.send', {})
    expect(recovered.results[0]?.status).toBe('error')
    expect(events).toHaveLength(6)
  })

  it('成功一次后失败计数清零', async () => {
    const { host } = createHost({ failureThreshold: 5 })

    let shouldFail = true
    host.register('notification.send', {
      pluginKey: 'flaky-plugin',
      handler: () => {
        if (shouldFail) {
          throw new Error('boom')
        }
        return { ok: true }
      }
    })

    for (let i = 0; i < 4; i++) {
      await host.callHook('notification.send', {})
    }
    expect(host.circuitBreaker.getState('flaky-plugin').failures).toBe(4)
    expect(host.circuitBreaker.isOpen('flaky-plugin')).toBe(false)

    shouldFail = false
    await host.callHook('notification.send', {})

    expect(host.circuitBreaker.getState('flaky-plugin').failures).toBe(0)

    // 计数清零后，再失败 4 次也不会熔断
    shouldFail = true
    for (let i = 0; i < 4; i++) {
      await host.callHook('notification.send', {})
    }
    expect(host.circuitBreaker.isOpen('flaky-plugin')).toBe(false)
  })
})
