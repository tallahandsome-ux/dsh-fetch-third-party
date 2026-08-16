/**
 * In-process fetch cache: same URL within a TTL is served from memory, so a
 * repeat fetch neither hits the third-party service (saving quota) nor consumes
 * the per-session budget. Entries are LRU-capped; expired entries are evicted
 * lazily on read. The cache is global across sessions (the point is cross-session
 * saving), while the budget remains per-session.
 * @module dsh-fetch-third-party/cache
 */

import type { WebFetchResult } from '@deepseek-ai/dsh-web'

interface CacheEntry {
  value: WebFetchResult
  storedAt: number
}

/**
 * Normalize a URL into a cache key: absolute href without the fragment.
 * Returns undefined for unparseable URLs (never cached).
 */
export function normalizeURL(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}

/** LRU + TTL fetch cache. Limits are read live from the config thunks. */
export class FetchCache {
  private readonly map = new Map<string, CacheEntry>()

  constructor(
    private readonly ttlMs: () => number,
    private readonly maxEntries: () => number,
  ) {}

  /** Current entry count. */
  get size(): number {
    return this.map.size
  }

  /** Return a fresh cached result, or undefined on miss / expiry. */
  get(url: string): WebFetchResult | undefined {
    const key = normalizeURL(url)
    if (key === undefined) return undefined
    const entry = this.map.get(key)
    if (entry === undefined) return undefined
    if (Date.now() - entry.storedAt >= this.ttlMs()) {
      this.map.delete(key)
      return undefined
    }
    // LRU: refresh recency on every hit.
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  /** Store a result; evict the least-recently-used entry when over the cap. */
  set(url: string, value: WebFetchResult): void {
    const key = normalizeURL(url)
    if (key === undefined) return
    // 0 = no cap (unlimited); entries are only evicted under a positive cap.
    const limit = this.maxEntries()
    if (limit > 0 && this.map.size >= limit) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, { value, storedAt: Date.now() })
  }

  /** Remove one URL (or no-op for an unparseable one). */
  delete(url: string): void {
    const key = normalizeURL(url)
    if (key !== undefined) this.map.delete(key)
  }

  /** Drop everything. */
  clear(): void {
    this.map.clear()
  }
}
