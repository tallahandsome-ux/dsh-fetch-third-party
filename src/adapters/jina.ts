/**
 * Jina Reader adapter: GET `r.jina.ai/<encoded target URL>` → LLM-ready
 * markdown. Anonymous use works without a key (lower rate limits); a Bearer
 * key raises the quota. Response shape verified against the live API
 * (JSON mode): `{ code, status, data: { title, url, content, ... } }`.
 * @module dsh-fetch-third-party/adapters/jina
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { dispatcherFor, type FetchAdapter, type FetchAdapterContext } from './types.ts'

/** Body size cap applied to non-2xx error bodies (they are diagnostics, not pages). */
const ERROR_BODY_CAP = 100_000

/** The Jina Reader JSON envelope. */
interface JinaResponse {
  code?: unknown
  status?: unknown
  data?: {
    title?: unknown
    url?: unknown
    content?: unknown
  }
}

/** The Jina Reader fetch backend. */
export const jinaAdapter: FetchAdapter = {
  id: 'jina',
  label: 'Jina Reader',
  async fetch(ctx: FetchAdapterContext, request, signal): Promise<WebFetchResult> {
    // The target URL rides in the PATH, fully encoded: Jina accepts both raw
    // and encoded forms, and encoding keeps a target's own query string from
    // being parsed as this request's query.
    const base = ctx.baseURL.replace(/\/+$/, '')
    const endpoint = `${base}/${encodeURIComponent(request.url)}`
    const dispatcher = dispatcherFor(ctx.proxy)
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...ctx.apiKey !== undefined && ctx.apiKey.length > 0
            ? { authorization: `Bearer ${ctx.apiKey}` }
            : {},
        },
        ...dispatcher !== undefined ? { dispatcher } : {},
        signal,
      })
    } catch (error) {
      // Network-level failure (DNS, connect, TLS, timeout): surface a clear,
      // routable error instead of leaking the raw undici exception.
      const cause = error instanceof Error ? error.message : String(error)
      throw new WebError(`Jina Reader 服务不可达：${cause}`, 'WEB_PROVIDER_ERROR', { cause: error })
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
    const data = await response.json().catch(() => null) as JinaResponse | null
    if (data === null || data.data === undefined) {
      throw new WebError('Jina Reader returned an unparseable response', 'WEB_PROVIDER_ERROR')
    }
    const content = typeof data.data.content === 'string' ? data.data.content : ''
    const status = typeof data.status === 'number' ? data.status : 200
    return {
      url: typeof data.data.url === 'string' ? data.data.url : request.url,
      statusCode: status,
      body: { kind: 'text', content },
      truncated: false,
    }
  },
}
