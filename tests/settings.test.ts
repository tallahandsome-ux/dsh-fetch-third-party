import { describe, expect, it } from 'vitest'
import {
  BASE_URL_BY_ADAPTER, KEY_ENV_BY_ADAPTER,
  resolveBaseURL, resolveKeyEnv, resolveProvider,
  type Config,
} from '../src/settings.ts'

function config(overrides: Partial<Config> = {}): Config {
  return {
    adapter: 'firecrawl',
    fallback: '',
    baseURL: '',
    apiKeyEnv: '',
    maxFetchesPerSession: 10,
    proxy: '',
    proxyEnabled: true,
    customProviders: [],
    ...overrides,
  }
}

describe('resolveBaseURL', () => {
  it('falls back to the adapter stock default when baseURL is empty (B1 regression)', () => {
    expect(resolveBaseURL(config({ adapter: 'firecrawl', baseURL: '' }))).toBe('https://api.firecrawl.dev')
    expect(resolveBaseURL(config({ adapter: 'jina', baseURL: '' }))).toBe('https://r.jina.ai')
    expect(resolveBaseURL(config({ adapter: 'tavily', baseURL: '' }))).toBe('https://api.tavily.com')
  })

  it('uses the flat baseURL override for the primary adapter', () => {
    const cfg = config({ adapter: 'firecrawl', baseURL: 'http://self-hosted:8080' })
    expect(resolveBaseURL(cfg)).toBe('http://self-hosted:8080')
  })

  it('ignores the flat override for a non-primary adapter', () => {
    const cfg = config({ adapter: 'firecrawl', baseURL: 'http://self-hosted:8080' })
    expect(resolveBaseURL(cfg, 'jina')).toBe('https://r.jina.ai')
  })
})

describe('resolveProvider', () => {
  it('resolves a built-in adapter with its stock facts', () => {
    const cfg = config({ adapter: 'jina', baseURL: '' })
    expect(resolveProvider(cfg, 'jina')).toEqual({
      adapter: 'jina',
      baseURL: 'https://r.jina.ai',
      apiKeyEnv: 'JINA_API_KEY',
    })
  })

  it('resolves a custom provider from its own table row', () => {
    const cfg = config({
      adapter: 'crawl4ai',
      customProviders: [{ name: 'crawl4ai', adapter: 'custom', baseURL: 'http://127.0.0.1:8787', apiKeyEnv: '' }],
    })
    expect(resolveProvider(cfg, 'crawl4ai')).toEqual({
      adapter: 'custom',
      baseURL: 'http://127.0.0.1:8787',
      apiKeyEnv: '',
    })
  })

  it('returns undefined for an unknown provider', () => {
    expect(resolveProvider(config(), 'does-not-exist')).toBeUndefined()
  })
})

describe('resolveKeyEnv', () => {
  it('uses the adapter standard reference for built-ins', () => {
    expect(resolveKeyEnv(config({ adapter: 'firecrawl', apiKeyEnv: '' }))).toBe('FIRECRAWL_API_KEY')
    expect(resolveKeyEnv(config({ adapter: 'jina', apiKeyEnv: '' }))).toBe('JINA_API_KEY')
  })

  it('prefers the explicit primary override', () => {
    const cfg = config({ adapter: 'tavily', apiKeyEnv: 'MY_CUSTOM_REF' })
    expect(resolveKeyEnv(cfg)).toBe('MY_CUSTOM_REF')
  })
})
