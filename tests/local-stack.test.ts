import { describe, expect, it } from 'vitest'
import { isLoopbackURL, LocalStackManager } from '../src/local-stack.ts'
import type { Config } from '../src/settings.ts'

function config(partial: Partial<Config>): Config {
  return {
    adapter: 'firecrawl',
    fallback: '',
    baseURL: '',
    apiKeyEnv: '',
    maxFetchesPerSession: 10,
    proxy: '',
    proxyEnabled: true,
    customProviders: [],
    cacheEnabled: true,
    cacheTtlSeconds: 600,
    cacheMaxEntries: 200,
    rejectPrivateTargets: true,
    toolName: 'web_fetch_url',
    fallbackChain: [],
    cooldownEnabled: true,
    quotaCooldownSeconds: 3600,
    failureCooldownSeconds: 60,
    ...partial,
  }
}

const CRAWL4AI = { name: 'crawl4ai', adapter: 'custom', baseURL: 'http://127.0.0.1:8787', apiKeyEnv: '' }

function manager(partial: Partial<Config>) {
  return new LocalStackManager(() => config(partial))
}

describe('isLoopbackURL', () => {
  it('recognizes loopback forms', () => {
    expect(isLoopbackURL('http://127.0.0.1:8787')).toBe(true)
    expect(isLoopbackURL('http://localhost:8787')).toBe(true)
    expect(isLoopbackURL('http://[::1]:8787')).toBe(true)
  })

  it('rejects public and malformed URLs', () => {
    expect(isLoopbackURL('https://r.jina.ai')).toBe(false)
    expect(isLoopbackURL('not a url')).toBe(false)
  })
})

describe('LocalStackManager.needsLocal', () => {
  it('triggers when the primary is a loopback custom provider', () => {
    expect(manager({ adapter: 'crawl4ai', customProviders: [CRAWL4AI] }).needsLocal()).toBe(true)
  })

  it('triggers when the fallback is a loopback custom provider', () => {
    expect(manager({ adapter: 'firecrawl', fallback: 'crawl4ai', customProviders: [CRAWL4AI] }).needsLocal()).toBe(true)
  })

  it('triggers when a loopback provider sits ONLY in the fallbackChain (H3)', () => {
    expect(manager({ adapter: 'tavily', fallbackChain: ['crawl4ai'], customProviders: [CRAWL4AI] }).needsLocal()).toBe(true)
  })

  it('does not trigger without a loopback custom provider', () => {
    expect(manager({ adapter: 'tavily', fallback: 'jina' }).needsLocal()).toBe(false)
    expect(manager({ adapter: 'crawl4ai' }).needsLocal()).toBe(false) // name unknown / not configured
  })
})
