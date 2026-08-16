/**
 * Tavily adapter: speaks Tavily's native `/extract` API.
 *
 * The request goes to Tavily's servers; Tavily fetches the target URL and
 * returns its content. The local machine never connects to the target —
 * this is the "courier" model that keeps the SSRF surface off the host.
 * @module dsh-fetch-third-party/adapters/tavily
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { dispatcherFor, type FetchAdapter, type FetchAdapterContext } from './types.ts'

/** Body size cap applied to non-2xx error bodies (they are diagnostics, not pages). */
const ERROR_BODY_CAP = 100_000

/** The Tavily extract operation path, appended to the configured base URL. */
const EXTRACT_PATH = '/extract'

/** One `results[]` entry Tavily returns for a successfully extracted URL. */
interface TavilyExtractResult {
  url?: unknown
  raw_content?: unknown
  content?: unknown
}

/** One `failed_results[]` entry explaining an unextractable URL. */
interface TavilyFailedResult {
  url?: unknown
  error?: unknown
}

/** Tavily's response envelope for POST /extract. */
interface TavilyExtractResponse {
  results?: TavilyExtractResult[]
  failed_results?: TavilyFailedResult[]
}

/** The Tavily fetch backend. */
export const tavilyAdapter: FetchAdapter = {
  id: 'tavily',
  label: 'Tavily',
  async fetch(ctx: FetchAdapterContext, request, signal): Promise<WebFetchResult> {
    const endpoint = new URL(EXTRACT_PATH, ctx.baseURL)
    const dispatcher = dispatcherFor(ctx.proxy)
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...ctx.apiKey !== undefined ? { authorization: `Bearer ${ctx.apiKey}` } : {},
        },
        body: JSON.stringify({ urls: [request.url], extract_depth: 'basic' }),
        ...dispatcher !== undefined ? { dispatcher } : {},
        signal,
      })
    } catch (error) {
      // Network-level failure (DNS, connect, TLS, timeout): surface a clear,
      // routable error instead of leaking the raw undici exception.
      const cause = error instanceof Error ? error.message : String(error)
      throw new WebError(`Tavily 服务不可达：${cause}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    // A non-2xx response is a result (status + decoded body), not an error —
    // the seam's WebError is reserved for failures to retrieve or represent.
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        url: request.url,
        statusCode: response.status,
        body: { kind: 'text', content: text.slice(0, ERROR_BODY_CAP) },
        truncated: text.length > ERROR_BODY_CAP,
      }
    }
    const data = await response.json().catch(() => null) as TavilyExtractResponse | null
    const result = data?.results?.[0]
    if (data === null || result === undefined) {
      throw new WebError('Tavily extract returned no results', 'WEB_PROVIDER_ERROR')
    }
    const content = typeof result.raw_content === 'string' && result.raw_content.length > 0
      ? result.raw_content
      : typeof result.content === 'string'
        ? result.content
        : ''
    if (content.length === 0) {
      const failed = data.failed_results?.[0]
      const reason = typeof failed?.error === 'string' ? failed.error : 'empty content'
      throw new WebError(`Tavily extract failed: ${reason}`, 'WEB_PROVIDER_ERROR')
    }
    return {
      url: typeof result.url === 'string' ? result.url : request.url,
      statusCode: 200,
      body: { kind: 'text', content },
      truncated: false,
    }
  },
}
