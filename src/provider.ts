/**
 * The `third-party` WebFetchProvider: routes one URL to the configured
 * primary provider (built-in id or custom name) with an optional fallback
 * (the user picks it in the card — e.g. Jina Reader, keyless, as the safety
 * net), enforcing the per-session budget and resolving API keys from the
 * credentials domain per request.
 * @module dsh-fetch-third-party/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebFetchProvider, WebFetchRequest, WebFetchResult } from '@deepseek-ai/dsh-web'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { FetchAdapter, FetchAdapterContext } from './adapters/types.ts'
import { tavilyAdapter } from './adapters/tavily.ts'
import { jinaAdapter } from './adapters/jina.ts'
import { firecrawlAdapter } from './adapters/firecrawl.ts'
import { customAdapter } from './adapters/custom.ts'
import type { FetchBudget } from './budget.ts'
import type { FetchCache } from './cache.ts'
import { classifyFailure, FallbackRouter, type ChainRow } from './fallback.ts'
import { isLoopbackURL } from './local-stack.ts'
import { validateTargetURL } from './ssrf.ts'
import { resolveProvider, type Config } from './settings.ts'

/**
 * Adapters shipped: one file per third-party service, plus the contract-v1
 * `custom` adapter for user-registered services. This registry is the
 * built-in extension point.
 */
const ADAPTERS: Record<string, FetchAdapter> = {
  tavily: tavilyAdapter,
  jina: jinaAdapter,
  firecrawl: firecrawlAdapter,
  custom: customAdapter,
}

/** WebError code when the per-session fetch budget is exhausted. */
export const WEB_FETCH_BUDGET_EXHAUSTED = 'WEB_FETCH_BUDGET_EXHAUSTED'

/** HTTP statuses that count as a failed primary attempt and trigger fallback. */
const ERROR_STATUS_THRESHOLD = 400

/** Max characters of a fetched text body passed through to the model (contract v1: 100k). */
export const MAX_CONTENT_CHARS = 100_000

/**
 * Cap a fetch result's text body at {@link MAX_CONTENT_CHARS}, marking it
 * truncated. Adapters already cap non-2xx error bodies (diagnostics); this
 * covers success bodies so an oversized page cannot flood the model context
 * (the contract's "100,000 characters" bound was previously only documented).
 */
export function capContent(result: WebFetchResult): WebFetchResult {
  if (result.body.content.length <= MAX_CONTENT_CHARS) return result
  const { kind } = result.body
  const content = result.body.content.slice(0, MAX_CONTENT_CHARS)
  return {
    ...result,
    body: kind === 'html' ? { kind, content } : { kind, content },
    truncated: true,
  }
}

/** Outcome of one fetch attempt including which provider NAME served it. */
export interface FetchOutcome {
  result: WebFetchResult
  /** The provider name (built-in id or custom name) that served the request. */
  servedBy: string
}

/** Result of a config test (`testFetch`): no session budget consumed. */
export interface TestFetchResult {
  ok: boolean
  servedBy: string
  statusCode?: number
  contentLength?: number
  durationMs: number
  error?: string
}

/**
 * The fetch provider registered into `ctx.web` as `third-party`.
 * The model-facing `web_fetch_url` tool and any future official consumer
 * reach it through `ctx.web.fetch`.
 */
export class ThirdPartyFetchProvider implements WebFetchProvider {
  readonly id = 'third-party'

  private router: FallbackRouter | null = null
  private routerKey = ''

  constructor(
    private readonly ctx: Context,
    private readonly config: () => Config,
    private readonly budget: FetchBudget,
    private readonly cache: FetchCache,
  ) {}

  available(): boolean {
    return true
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const config = this.config()
    // Defense-in-depth: refuse private/reserved targets the model asks for.
    if (config.rejectPrivateTargets) {
      validateTargetURL(request.url)
    }
    // A cache hit neither hits the third-party service nor consumes the budget.
    if (config.cacheEnabled) {
      const hit = this.cache.get(request.url)
      if (hit !== undefined) {
        console.log('[dsh-fetch-third-party] cache hit:', request.url)
        return hit
      }
    }
    const sessionId = this.currentSessionId()
    const acquired = this.budget.tryAcquire(sessionId)
    if (!acquired.ok) {
      throw new WebError(
        `已达本会话抓取上限 ${acquired.limit}，可在插件配置中调整`,
        WEB_FETCH_BUDGET_EXHAUSTED,
      )
    }
    const outcome = await this.attemptWithChain(config, request, signal, true)
    const result = capContent(outcome.result)
    // Only cache successful, non-empty results (error pages are transient).
    if (config.cacheEnabled
      && result.statusCode < ERROR_STATUS_THRESHOLD
      && result.body.content.length > 0) {
      this.cache.set(request.url, result)
    }
    return result
  }

  /**
   * Test the configured routing without consuming the session budget.
   * Runs the same primary→fallback chain and reports which provider served.
   * @param url - the URL to fetch (the card defaults to https://example.com).
   * @returns the test outcome; network/provider failures are folded into the
   *   result rather than thrown.
   */
  async testFetch(url: string): Promise<TestFetchResult> {
    const config = this.config()
    const request: WebFetchRequest = { url }
    const started = Date.now()
    try {
      const { result, servedBy } = await this.attemptWithChain(config, request, undefined, false)
      const capped = capContent(result)
      return {
        ok: result.statusCode < ERROR_STATUS_THRESHOLD,
        servedBy,
        statusCode: result.statusCode,
        contentLength: capped.body.content.length,
        durationMs: Date.now() - started,
      }
    } catch (error) {
      return {
        ok: false,
        servedBy: config.adapter,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Run the dynamic fallback chain for one request; reports the provider that
   * served. Each failure cools its provider down (quota or exponential backoff)
   * so the next provider in the chain is tried; a success resets the counter.
   * @param persist - record cooldown state (false for the card's test fetch).
   */
  private async attemptWithChain(
    config: Config,
    request: WebFetchRequest,
    signal: AbortSignal | undefined,
    persist: boolean,
  ): Promise<FetchOutcome> {
    const router = this.chainRouter(config)
    const tried = new Set<string>()
    const failures: string[] = []
    let lastError: unknown = null
    for (;;) {
      const name = router.next(tried)
      if (name === undefined) break
      tried.add(name)
      const adapter = await this.adapterFor(config, name)
      if (adapter === undefined) continue // unknown provider: skip
      let result: WebFetchResult
      try {
        result = await adapter.fetch(await this.providerContext(config, name), request, signal)
      } catch (error) {
        failures.push(`${name} 抛错`)
        lastError = error
        if (persist) router.recordFailure(name, classifyFailure(error))
        continue
      }
      if (result.statusCode >= ERROR_STATUS_THRESHOLD) {
        failures.push(`${name} HTTP ${result.statusCode}`)
        lastError = new WebError(`${name} 返回 HTTP ${result.statusCode}`, 'WEB_PROVIDER_ERROR')
        if (persist) router.recordFailure(name, classifyFailure(null, result.statusCode))
        continue
      }
      if (persist) router.recordSuccess(name)
      return { result, servedBy: name }
    }
    const detail = tried.size > 0
      ? `尝试了 ${[...tried].join(' → ')}：${lastError instanceof Error ? lastError.message : '全部失败'}`
      : '回退链为空或全部不可用'
    throw new WebError(`抓取失败（${detail}）`, 'WEB_PROVIDER_ERROR', lastError !== null && lastError !== undefined ? { cause: lastError } : undefined)
  }

  /** The chain used for routing: explicit config, else adapter+fallback. */
  private effectiveChain(config: Config): string[] {
    if (config.fallbackChain.length > 0) return [...config.fallbackChain]
    return [config.adapter, config.fallback].filter((name) => name.length > 0)
  }

  /** The router for the current chain; rebuilt only when the chain changes. */
  private chainRouter(config: Config): FallbackRouter {
    const chain = this.effectiveChain(config)
    const key = chain.join(',')
    if (this.router === null || key !== this.routerKey) {
      this.router = new FallbackRouter(chain, () => {
        const c = this.config()
        return {
          enabled: c.cooldownEnabled,
          quotaSeconds: c.quotaCooldownSeconds,
          failureSeconds: c.failureCooldownSeconds,
        }
      })
      this.routerKey = key
    }
    return this.router
  }

  /** Live chain order + cooldown state, for the settings card. */
  chainSnapshot(): ChainRow[] {
    return this.chainRouter(this.config()).snapshot()
  }

  /** The adapter driving one provider name, or undefined when unknown. */
  private async adapterFor(config: Config, name: string): Promise<FetchAdapter | undefined> {
    const resolved = resolveProvider(config, name)
    if (resolved === undefined) return undefined
    return ADAPTERS[resolved.adapter]
  }

  /** Build one provider's call context from its resolved facts. */
  private async providerContext(config: Config, name: string): Promise<FetchAdapterContext> {
    const resolved = resolveProvider(config, name)
    if (resolved === undefined) throw new WebError(`unknown provider "${name}"`, 'WEB_PROVIDER_ERROR')
    const apiKey = await this.resolveKey(resolved.apiKeyEnv)
    return {
      baseURL: resolved.baseURL,
      apiKey,
      // The proxy applies only when enabled AND a value is set; the address
      // is kept in the section even while disabled. Loopback endpoints
      // (self-hosted wrappers) always connect directly — a proxy cannot
      // reach 127.0.0.1 and would break the local stack.
      proxy: config.proxyEnabled && config.proxy.length > 0 && !isLoopbackURL(resolved.baseURL)
        ? config.proxy
        : undefined,
    }
  }

  /** The initiating agent's session id, or undefined outside an agent. */
  private currentSessionId(): string | undefined {
    return this.ctx.get('agents')?.currentInitiator()?.session?.id
  }

  /** Resolve one credential reference: credentials domain first, environment fallback. */
  private async resolveKey(envName: string): Promise<string | undefined> {
    // Empty reference = anonymous provider (e.g. a custom service or Jina
    // without a key): skip the credential lookup entirely.
    if (envName.length === 0) return undefined
    const ref = credentialRef(envName)
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      const resolved = await credentials.resolve(ref)
      if (resolved !== undefined) return resolved.value
    }
    const ambient = launchEnvironmentOf(this.ctx).get(envName)
    return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
  }
}
