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
})
