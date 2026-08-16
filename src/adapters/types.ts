/**
 * Adapter contract: one adapter knows how to speak ONE third-party service's
 * native API and normalizes its response into the seam's WebFetchResult.
 *
 * Adding a service = adding one adapter module (P2 direction 1); the provider
 * routes by the configured `adapter` id. User-built services (n8n / custom
 * crawler) conform to the fetch contract documented in docs/contract.md.
 * @module dsh-fetch-third-party/adapters
 */

import type { WebFetchRequest, WebFetchResult } from '@deepseek-ai/dsh-web'
import { ProxyAgent } from 'undici'

/** What an adapter needs to reach the configured third-party service. */
export interface FetchAdapterContext {
  /** User-configured endpoint (may carry a path prefix). */
  baseURL: string
  /** Resolved API key, present when the credentials store holds one. */
  apiKey?: string
  /** Optional HTTP proxy for the fetch (per-request; no process-wide effect). */
  proxy?: string
}

/** Cached undici proxy agents, keyed by proxy URL (connection pooling). */
const proxyAgents = new Map<string, ProxyAgent>()

/**
 * The dispatcher to route one fetch through `proxy`, or undefined for direct.
 * One ProxyAgent per proxy URL; agents are reused for pooled connections and
 * never affect the process's other network traffic.
 * @param proxy - the proxy URL, or undefined/empty for a direct request.
 * @returns the dispatcher to pass as `dispatcher`, or undefined.
 */
export function dispatcherFor(proxy: string | undefined): ProxyAgent | undefined {
  if (proxy === undefined || proxy.length === 0) return undefined
  let agent = proxyAgents.get(proxy)
  if (agent === undefined) {
    agent = new ProxyAgent(proxy)
    proxyAgents.set(proxy, agent)
  }
  return agent
}

/** One third-party fetch backend. */
export interface FetchAdapter {
  /** Stable id the settings section selects by. */
  readonly id: string
  /** Human label for the GUI card. */
  readonly label: string
  /** Retrieve one URL through this service; honor `signal`. */
  fetch(ctx: FetchAdapterContext, request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
}
