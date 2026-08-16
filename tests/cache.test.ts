import { describe, expect, it } from 'vitest'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { FetchCache, normalizeURL } from '../src/cache.ts'

function value(url: string, content = 'body'): WebFetchResult {
  return { url, statusCode: 200, body: { kind: 'text', content }, truncated: false }
}

/** Cache with controllable ttl/max thunks (deterministic TTL tests without timers). */
function makeCache(ttl = 100_000, max = 10) {
  let ttlMs = ttl
  let maxEntries = max
  const cache = new FetchCache(() => ttlMs, () => maxEntries)
  return { cache, setTtl: (v: number) => { ttlMs = v }, setMax: (v: number) => { maxEntries = v } }
}

describe('normalizeURL', () => {
  it('strips the fragment', () => {
    expect(normalizeURL('https://a.com/p#sec')).toBe('https://a.com/p')
  })

  it('keeps the rest of the href stable', () => {
    expect(normalizeURL('HTTPS://A.com:443/p?q=1#x')).toBe('https://a.com/p?q=1')
  })

  it('returns undefined for an unparseable url', () => {
    expect(normalizeURL('not a url')).toBeUndefined()
  })
})

describe('FetchCache', () => {
  it('round-trips a value', () => {
    const { cache } = makeCache()
    cache.set('https://a.com', value('https://a.com'))
    expect(cache.get('https://a.com')).toEqual(value('https://a.com'))
  })

  it('shares the key across fragment variants', () => {
    const { cache } = makeCache()
    cache.set('https://a.com/p#one', value('https://a.com/p'))
    expect(cache.get('https://a.com/p#two')).toEqual(value('https://a.com/p'))
  })

  it('expires after the TTL (lazy eviction)', () => {
    const { cache, setTtl } = makeCache()
    cache.set('https://a.com', value('https://a.com'))
    setTtl(0)
    expect(cache.get('https://a.com')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('evicts the least-recently-used entry at the cap', () => {
    const { cache, setMax } = makeCache(100_000, 2)
    void setMax
    const v1 = value('https://a.com/1')
    const v2 = value('https://a.com/2')
    const v3 = value('https://a.com/3')
    cache.set('https://a.com/1', v1)
    cache.set('https://a.com/2', v2)
    cache.get('https://a.com/1') // refresh recency of 1
    cache.set('https://a.com/3', v3) // evicts 2 (least recently used)
    expect(cache.get('https://a.com/1')).toEqual(v1)
    expect(cache.get('https://a.com/2')).toBeUndefined()
    expect(cache.get('https://a.com/3')).toEqual(v3)
  })

  it('never stores an unparseable url', () => {
    const { cache } = makeCache()
    cache.set('nonsense', value('nonsense'))
    expect(cache.size).toBe(0)
  })

  it('delete removes a single entry; clear drops everything', () => {
    const { cache } = makeCache()
    cache.set('https://a.com', value('https://a.com'))
    cache.delete('https://a.com')
    expect(cache.get('https://a.com')).toBeUndefined()
    cache.set('https://a.com', value('https://a.com'))
    cache.clear()
    expect(cache.size).toBe(0)
  })
})
