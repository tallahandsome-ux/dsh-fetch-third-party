import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { customAdapter } from '../src/adapters/custom.ts'
import { firecrawlAdapter } from '../src/adapters/firecrawl.ts'
import { jinaAdapter } from '../src/adapters/jina.ts'
import { tavilyAdapter } from '../src/adapters/tavily.ts'
import type { FetchAdapter, FetchAdapterContext } from '../src/adapters/types.ts'

const REQ = { url: 'https://example.com/page?q=1' }

function ctx(overrides: Partial<FetchAdapterContext> = {}): FetchAdapterContext {
  return { baseURL: 'https://api.example.test', ...overrides }
}

interface StubInit {
  ok?: boolean
  status?: number
  json?: unknown
  text?: string
  throwError?: Error
}

/** Stub the global fetch with one canned response (or a thrown error). */
function stubFetch(init: StubInit): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  if (init.throwError !== undefined) {
    fn.mockRejectedValue(init.throwError)
  } else {
    fn.mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => init.json,
      text: async () => init.text ?? '',
    })
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function expectWebError(promise: Promise<WebFetchResult>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the fetch to reject')
}

function run(adapter: FetchAdapter, init: StubInit, context = ctx()) {
  return adapter.fetch(context, REQ, undefined)
}

describe('tavilyAdapter', () => {
  it('extracts raw_content from a successful response', async () => {
    const fn = stubFetch({ json: { results: [{ url: 'https://e.com', raw_content: 'the body' }] } })
    const result = await run(tavilyAdapter, {})
    expect(result.statusCode).toBe(200)
    expect(result.body.content).toBe('the body')
    expect(result.url).toBe('https://e.com')
    expect(result.truncated).toBe(false)
    // POST /extract with the target URL in the body
    expect(fn.mock.calls[0][0]).toBe('https://api.example.test/extract')
    expect(JSON.parse(fn.mock.calls[0][1].body).urls).toEqual([REQ.url])
  })

  it('falls back to content when raw_content is missing', async () => {
    stubFetch({ json: { results: [{ content: 'alt body' }] } })
    expect((await run(tavilyAdapter, {})).body.content).toBe('alt body')
  })

  it('treats a non-2xx response as a result, not an error', async () => {
    stubFetch({ ok: false, status: 429, text: 'rate limited' })
    const result = await run(tavilyAdapter, {})
    expect(result.statusCode).toBe(429)
    expect(result.body.content).toBe('rate limited')
    expect(result.truncated).toBe(false) // short error body stays under the cap
  })

  it('caps oversized non-2xx error bodies', async () => {
    const huge = 'e'.repeat(200_000)
    stubFetch({ ok: false, status: 500, text: huge })
    const result = await run(tavilyAdapter, {})
    expect(result.body.content.length).toBe(100_000)
    expect(result.truncated).toBe(true)
  })

  it('rejects when no result is returned', async () => {
    stubFetch({ json: {} })
    const error = await expectWebError(run(tavilyAdapter, {}))
    expect(error.message).toMatch(/no results/)
  })

  it('rejects when the result is empty and failed_results explains it', async () => {
    stubFetch({ json: { results: [{}], failed_results: [{ url: REQ.url, error: 'blocked' }] } })
    const error = await expectWebError(run(tavilyAdapter, {}))
    expect(error.message).toMatch(/blocked/)
  })

  it('wraps network failures as a clear WebError', async () => {
    stubFetch({ throwError: new Error('ECONNREFUSED') })
    const error = await expectWebError(run(tavilyAdapter, {}))
    expect(error.message).toMatch(/服务不可达/)
  })

  it('preserves a path prefix on the base URL (M1 regression)', async () => {
    const fn = stubFetch({ json: { results: [{ raw_content: 'x' }] } })
    await run(tavilyAdapter, {}, ctx({ baseURL: 'https://api.example.test/v1' }))
    expect(fn.mock.calls[0][0]).toBe('https://api.example.test/v1/extract')
  })
})

describe('jinaAdapter', () => {
  it('parses the JSON envelope and reports its status', async () => {
    const fn = stubFetch({ json: { code: 200, status: 200, data: { title: 'T', url: 'https://e.com', content: 'body' } } })
    const result = await run(jinaAdapter, {})
    expect(result.statusCode).toBe(200)
    expect(result.body.content).toBe('body')
    expect(result.url).toBe('https://e.com')
    // target rides in the path, fully encoded
    expect(fn.mock.calls[0][0]).toBe('https://api.example.test/' + encodeURIComponent(REQ.url))
    expect(fn.mock.calls[0][1].method).toBe('GET')
  })

  it('treats a non-2xx response as a result', async () => {
    stubFetch({ ok: false, status: 403, text: 'denied' })
    const result = await run(jinaAdapter, {})
    expect(result.statusCode).toBe(403)
    expect(result.body.content).toBe('denied')
  })

  it('rejects an unparseable envelope', async () => {
    stubFetch({ json: { code: 500 } })
    const error = await expectWebError(run(jinaAdapter, {}))
    expect(error.message).toMatch(/unparseable/)
  })

  it('trims a trailing slash from the base URL', async () => {
    const fn = stubFetch({ json: { data: { content: 'x' } } })
    await run(jinaAdapter, {}, ctx({ baseURL: 'https://api.example.test/' }))
    expect(fn.mock.calls[0][0]).toBe('https://api.example.test/' + encodeURIComponent(REQ.url))
  })
})

describe('firecrawlAdapter', () => {
  it('parses markdown and the source URL', async () => {
    const fn = stubFetch({ json: { success: true, data: { markdown: '# H', metadata: { sourceURL: 'https://e.com' } } } })
    const result = await run(firecrawlAdapter, {})
    expect(result.statusCode).toBe(200)
    expect(result.body.content).toBe('# H')
    expect(result.url).toBe('https://e.com')
    expect(fn.mock.calls[0][0]).toBe('https://api.example.test/v2/scrape')
    expect(JSON.parse(fn.mock.calls[0][1].body).formats).toEqual(['markdown'])
  })

  it('rejects when success is not true', async () => {
    stubFetch({ json: { success: false } })
    const error = await expectWebError(run(firecrawlAdapter, {}))
    expect(error.message).toMatch(/failed/)
  })

  it('preserves a path prefix on the base URL (M1 regression)', async () => {
    const fn = stubFetch({ json: { success: true, data: { markdown: 'x' } } })
    await run(firecrawlAdapter, {}, ctx({ baseURL: 'https://host:8080/proxy' }))
    expect(fn.mock.calls[0][0]).toBe('https://host:8080/proxy/v2/scrape')
  })
})

describe('customAdapter', () => {
  it('speaks contract v1: POST {url} → {content, statusCode}', async () => {
    const fn = stubFetch({ json: { content: 'fetched', statusCode: 200 } })
    const result = await run(customAdapter, {})
    expect(result.statusCode).toBe(200)
    expect(result.body.content).toBe('fetched')
    expect(fn.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(fn.mock.calls[0][1].body).url).toBe(REQ.url)
  })

  it('rejects when the contract envelope lacks content', async () => {
    stubFetch({ json: { statusCode: 200 } })
    const error = await expectWebError(run(customAdapter, {}))
    expect(error.message).toMatch(/契约 v1/)
  })

  it('treats a non-2xx response as a result', async () => {
    stubFetch({ ok: false, status: 502, text: 'upstream error' })
    const result = await run(customAdapter, {})
    expect(result.statusCode).toBe(502)
    expect(result.body.content).toBe('upstream error')
  })

  it('sends the Bearer key when configured', async () => {
    const fn = stubFetch({ json: { content: 'x' } })
    await run(customAdapter, {}, ctx({ apiKey: 'sekret' }))
    expect(fn.mock.calls[0][1].headers.authorization).toBe('Bearer sekret')
  })
})
