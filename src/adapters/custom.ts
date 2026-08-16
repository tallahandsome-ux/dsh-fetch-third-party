/**
 * Custom adapter: implements fetch contract v1 (docs/contract.md) for
 * user-built services — n8n workflows, self-hosted crawlers, or any HTTP
 * endpoint the user controls.
 *
 * Contract:
 *   POST {baseURL}                 Authorization: Bearer {key} (optional)
 *   Body: { "url": "<target>" }
 *   → 200 JSON { "content": "...", "statusCode"?: number, "title"?: string }
 *
 * The service itself fetches the target URL — the plugin host never connects
 * to it directly.
 * @module dsh-fetch-third-party/adapters/custom
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { dispatcherFor, type FetchAdapter, type FetchAdapterContext } from './types.ts'

/** Body size cap applied to non-2xx error bodies (they are diagnostics, not pages). */
const ERROR_BODY_CAP = 100_000

/** The contract v1 response envelope a custom service must return. */
interface ContractResponse {
  content?: unknown
  statusCode?: unknown
  title?: unknown
}

/** The contract-v1 fetch backend for user-registered custom services. */
export const customAdapter: FetchAdapter = {
  id: 'custom',
  label: 'Custom (contract v1)',
  async fetch(ctx: FetchAdapterContext, request, signal): Promise<WebFetchResult> {
    const dispatcher = dispatcherFor(ctx.proxy)
    let response: Response
    try {
      response = await fetch(ctx.baseURL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...ctx.apiKey !== undefined && ctx.apiKey.length > 0
            ? { authorization: `Bearer ${ctx.apiKey}` }
            : {},
        },
        body: JSON.stringify({ url: request.url }),
        ...dispatcher !== undefined ? { dispatcher } : {},
        signal,
      })
    } catch (error) {
      // Network-level failure (DNS, connect, TLS, timeout): surface a clear,
      // routable error instead of leaking the raw undici exception.
      const cause = error instanceof Error ? error.message : String(error)
      throw new WebError(`自定义服务不可达：${cause}`, 'WEB_PROVIDER_ERROR', { cause: error })
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
    const data = await response.json().catch(() => null) as ContractResponse | null
    if (data === null || typeof data.content !== 'string') {
      throw new WebError(
        '自定义服务未按契约 v1 返回 JSON {content}（POST {url} → {content, statusCode?, title?}），请核对 docs/contract.md',
        'WEB_PROVIDER_ERROR',
      )
    }
    const status = typeof data.statusCode === 'number' ? data.statusCode : 200
    return {
      url: request.url,
      statusCode: status,
      body: { kind: 'text', content: data.content },
      truncated: false,
    }
  },
}
