/**
 * Firecrawl adapter: POST `/v2/scrape` → clean markdown.
 *
 * Reference: Firecrawl official skill / REST docs (docs/firecrawl-reference.md).
 * Unlike Jina, Firecrawl's keyless free tier only covers OFFICIAL clients
 * (MCP/CLI/SDK), so raw REST /scrape requires an API key.
 * @module dsh-fetch-third-party/adapters/firecrawl
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { dispatcherFor, type FetchAdapter, type FetchAdapterContext } from './types.ts'

/** Body size cap applied to non-2xx error bodies (they are diagnostics, not pages). */
const ERROR_BODY_CAP = 100_000

/** The scrape operation path, appended to the configured base URL. */
const SCRAPE_PATH = '/v2/scrape'

/** Firecrawl's scrape response envelope. */
interface FirecrawlScrapeResponse {
  success?: unknown
  data?: {
    markdown?: unknown
    metadata?: {
      sourceURL?: unknown
    }
  }
}

/** The Firecrawl fetch backend. */
export const firecrawlAdapter: FetchAdapter = {
  id: 'firecrawl',
  label: 'Firecrawl',
  async fetch(ctx: FetchAdapterContext, request, signal): Promise<WebFetchResult> {
    const endpoint = new URL(SCRAPE_PATH, ctx.baseURL)
    const dispatcher = dispatcherFor(ctx.proxy)
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...ctx.apiKey !== undefined && ctx.apiKey.length > 0
            ? { authorization: `Bearer ${ctx.apiKey}` }
            : {},
        },
        body: JSON.stringify({ url: request.url, formats: ['markdown'] }),
        ...dispatcher !== undefined ? { dispatcher } : {},
        signal,
      })
    } catch (error) {
      // Network-level failure (DNS, connect, TLS, timeout): surface a clear,
      // routable error instead of leaking the raw undici exception.
      const cause = error instanceof Error ? error.message : String(error)
      throw new WebError(`Firecrawl 服务不可达：${cause}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    // A non-2xx response is a result (status + decoded body), not an error.
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        url: request.url,
        statusCode: response.status,
        body: { kind: 'text', content: text.slice(0, ERROR_BODY_CAP) },
        truncated: text.length > ERROR_BODY_CAP,
      }
    }
    const data = await response.json().catch(() => null) as FirecrawlScrapeResponse | null
    if (data === null || data.success !== true || data.data === undefined) {
      throw new WebError('Firecrawl scrape failed', 'WEB_PROVIDER_ERROR')
    }
    const content = typeof data.data.markdown === 'string' ? data.data.markdown : ''
    const sourceURL = typeof data.data.metadata?.sourceURL === 'string'
      ? data.data.metadata.sourceURL
      : undefined
    return {
      url: sourceURL ?? request.url,
      statusCode: 200,
      body: { kind: 'text', content },
      truncated: false,
    }
  },
}
