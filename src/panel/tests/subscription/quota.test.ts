import { describe, expect, it } from 'vitest'
import {
  UNLIMITED_BYTES,
  canResetTraffic,
  evaluateQuota,
  isExpired,
  isOverused,
  nextResetAt,
  remainingBytes,
  usedRatio
} from '../../server/utils/quota'

describe('quota', () => {
  it('不限流量时永不超量，剩余字节为哨兵值', () => {
    expect(isOverused(0, 999999)).toBe(false)
    expect(remainingBytes(0, 100)).toBe(UNLIMITED_BYTES)
    expect(usedRatio(0, 100)).toBe(0)
  })

  it('流量用尽时判定为超量', () => {
    expect(isOverused(1000, 999)).toBe(false)
    expect(isOverused(1000, 1000)).toBe(true)
    expect(isOverused(1000, 1200)).toBe(true)
    expect(remainingBytes(1000, 1200)).toBe(0)
    expect(usedRatio(1000, 500)).toBe(0.5)
  })

  it('到期时间判定', () => {
    const now = new Date('2026-10-24T00:00:00.000Z')

    expect(isExpired(null, now)).toBe(false)
    expect(isExpired('2026-10-25T00:00:00.000Z', now)).toBe(false)
    expect(isExpired('2026-10-23T00:00:00.000Z', now)).toBe(true)
    expect(isExpired('2026-10-24T00:00:00.000Z', now)).toBe(true)
  })

  it('汇总配额状态', () => {
    const now = new Date('2026-10-24T00:00:00.000Z')

    const ok = evaluateQuota({
      status: 'active',
      trafficLimit: 1000,
      trafficUsed: 250,
      expireAt: '2026-12-01T00:00:00.000Z',
      now
    })
    expect(ok).toEqual({
      allowed: true,
      expired: false,
      overused: false,
      remainingBytes: 750,
      usedRatio: 0.25
    })

    const expired = evaluateQuota({
      status: 'active',
      trafficLimit: 1000,
      trafficUsed: 250,
      expireAt: '2026-10-01T00:00:00.000Z',
      now
    })
    expect(expired.expired).toBe(true)
    expect(expired.allowed).toBe(false)

    const overused = evaluateQuota({
      status: 'active',
      trafficLimit: 1000,
      trafficUsed: 1200,
      expireAt: '2026-12-01T00:00:00.000Z',
      now
    })
    expect(overused.overused).toBe(true)
    expect(overused.allowed).toBe(false)
    expect(overused.remainingBytes).toBe(0)
    expect(overused.usedRatio).toBe(1)

    const paused = evaluateQuota({
      status: 'paused',
      trafficLimit: 1000,
      trafficUsed: 0,
      expireAt: '2026-12-01T00:00:00.000Z',
      now
    })
    expect(paused.allowed).toBe(false)
  })

  it('下次重置时间按商品重置日计算', () => {
    const from = new Date('2026-10-24T00:00:00.000Z')

    expect(nextResetAt(1, from).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(nextResetAt(28, from).toISOString()).toBe('2026-10-28T00:00:00.000Z')
    expect(nextResetAt(null, from).toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('重置流量的时间判定', () => {
    const now = new Date('2026-10-24T00:00:00.000Z')

    expect(canResetTraffic(null, now)).toBe(true)
    expect(canResetTraffic('2026-10-20T00:00:00.000Z', now)).toBe(true)
    expect(canResetTraffic('2026-11-01T00:00:00.000Z', now)).toBe(false)
  })
})
