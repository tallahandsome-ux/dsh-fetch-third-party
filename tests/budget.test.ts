import { describe, expect, it } from 'vitest'
import { FetchBudget } from '../src/budget.ts'

describe('FetchBudget', () => {
  it('counts per session and refuses at the cap', () => {
    const budget = new FetchBudget(() => 2)
    expect(budget.tryAcquire('s1')).toEqual({ ok: true })
    expect(budget.tryAcquire('s1')).toEqual({ ok: true })
    expect(budget.tryAcquire('s1')).toEqual({ ok: false, limit: 2 })
    // A different session has its own count.
    expect(budget.tryAcquire('s2')).toEqual({ ok: true })
  })

  it('does not budget sessions without an id', () => {
    const budget = new FetchBudget(() => 1)
    expect(budget.tryAcquire(undefined)).toEqual({ ok: true })
    expect(budget.tryAcquire(undefined)).toEqual({ ok: true })
  })

  it('treats a non-positive cap as unlimited', () => {
    const budget = new FetchBudget(() => 0)
    expect(budget.tryAcquire('s1')).toEqual({ ok: true })
    expect(budget.tryAcquire('s1')).toEqual({ ok: true })
  })

  it('reset drops a session count', () => {
    const budget = new FetchBudget(() => 1)
    expect(budget.tryAcquire('s1')).toEqual({ ok: true })
    expect(budget.tryAcquire('s1')).toEqual({ ok: false, limit: 1 })
    budget.reset('s1')
    expect(budget.tryAcquire('s1')).toEqual({ ok: true })
  })

  it('bounds the tracked-session map (M4)', () => {
    const budget = new FetchBudget(() => 1)
    for (let i = 0; i < 5000; i++) budget.tryAcquire('s' + i)
    const counts = (budget as unknown as { counts: Map<string, number> }).counts
    expect(counts.size).toBeLessThanOrEqual(4096)
    // A brand-new session still fits after pruning.
    expect(budget.tryAcquire('fresh')).toEqual({ ok: true })
  })
})
