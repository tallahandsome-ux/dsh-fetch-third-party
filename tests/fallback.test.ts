import { describe, expect, it } from 'vitest'
import { classifyFailure, FallbackRouter } from '../src/fallback.ts'

function policy(overrides: Partial<{ enabled: boolean; quotaSeconds: number; failureSeconds: number }> = {}) {
  return () => ({
    enabled: true,
    quotaSeconds: 3600,
    failureSeconds: 60,
    ...overrides,
  })
}

describe('classifyFailure', () => {
  it('detects quota from HTTP status codes', () => {
    expect(classifyFailure(null, 429)).toBe('quota')
    expect(classifyFailure(null, 402)).toBe('quota')
    expect(classifyFailure(null, 500)).toBe('normal')
    expect(classifyFailure(null, 200)).toBe('normal')
  })

  it('detects quota from messages', () => {
    expect(classifyFailure(new Error('quota exceeded'))).toBe('quota')
    expect(classifyFailure(new Error('rate limit reached'))).toBe('quota')
    expect(classifyFailure(new Error('API 额度不足'))).toBe('quota')
    expect(classifyFailure(new Error('limit_reached'))).toBe('quota')
  })

  it('treats ordinary errors as normal', () => {
    expect(classifyFailure(new Error('connection refused'))).toBe('normal')
    expect(classifyFailure(new Error('已达本会话抓取上限'))).toBe('normal')
    expect(classifyFailure('boom')).toBe('normal')
  })
})

describe('FallbackRouter', () => {
  it('returns the base order first', () => {
    const r = new FallbackRouter(['a', 'b', 'c'], policy())
    expect(r.next(new Set())).toBe('a')
  })

  it('skips a provider in quota cooldown', () => {
    const r = new FallbackRouter(['a', 'b'], policy())
    r.recordFailure('a', 'quota')
    expect(r.next(new Set())).toBe('b')
  })

  it('honours the tried set when cooldown is disabled (fallback still works)', () => {
    const r = new FallbackRouter(['a', 'b'], policy({ enabled: false }))
    expect(r.next(new Set())).toBe('a')
    expect(r.next(new Set(['a']))).toBe('b')
    expect(r.next(new Set(['a', 'b']))).toBeUndefined()
  })

  it('quota cooldown uses the quota duration', () => {
    const r = new FallbackRouter(['a'], policy({ quotaSeconds: 120 }))
    r.recordFailure('a', 'quota')
    const row = r.snapshot().find(x => x.name === 'a')
    expect(row?.inCooldown).toBe(true)
    expect(row!.remainingSec).toBeGreaterThan(100)
    expect(row!.remainingSec).toBeLessThanOrEqual(120)
  })

  it('exponential backoff grows with consecutive failures', () => {
    const r = new FallbackRouter(['a'], policy({ failureSeconds: 1 }))
    r.recordFailure('a', 'normal')
    const first = r.snapshot()[0].remainingSec
    r.recordFailure('a', 'normal')
    const second = r.snapshot()[0].remainingSec
    expect(second).toBeGreaterThan(first)
  })

  it('a success resets the failure counter', () => {
    const r = new FallbackRouter(['a'], policy({ failureSeconds: 1 }))
    r.recordFailure('a', 'normal')
    r.recordFailure('a', 'normal')
    r.recordSuccess('a')
    r.recordFailure('a', 'normal')
    const row = r.snapshot()[0]
    expect(row.inCooldown).toBe(true)
    expect(row.remainingSec).toBeLessThanOrEqual(1)
  })

  it('recovers after the cooldown expires and returns to the base position', async () => {
    const r = new FallbackRouter(['a', 'b'], policy({ failureSeconds: 1 }))
    r.recordFailure('a', 'normal')
    expect(r.next(new Set())).toBe('b') // a is cooling
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(r.next(new Set())).toBe('a') // recovered, back to front
  })
})
