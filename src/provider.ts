/**
 * The `third-party` WebFetchProvider: routes one URL to the configured
 * primary provider (built-in id or custom name) with a fallback (default:
 * Jina Reader as the keyless safety net), enforcing the per-session budget
 * and resolving API keys from the credentials domain per request.
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

  constructor(
    private readonly ctx: Context,
    private readonly config: () => Config,
    private readonly budget: FetchBudget,
  ) {}

  available(): boolean {
    return true
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const config = this.config()
    const sessionId = this.currentSessionId()
    const acquired = this.budget.tryAcquire(sessionId)
    if (!acquired.ok) {
      throw new WebError(
        `已达本会话抓取上限 ${acquired.limit}，可在插件配置中调整`,
        WEB_FETCH_BUDGET_EXHAUSTED,
      )
    }
    return (await this.attemptWithFallback(config, request, signal)).result
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
      const { result, servedBy } = await this.attemptWithFallback(config, request, undefined)
      return {
        ok: result.statusCode < ERROR_STATUS_THRESHOLD,
        servedBy,
        statusCode: result.statusCode,
        contentLength: result.body.content.length,
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

  /** Run primary → fallback for one request; reports the provider that served. */
  private async attemptWithFallback(
    config: Config,
    request: WebFetchRequest,
    signal: AbortSignal | undefined,
  ): Promise<FetchOutcome> {
    const primaryName = config.adapter
    const primary = await this.adapterFor(config, primaryName)
    if (primary === undefined) {
      throw new WebError(`unknown provider "${primaryName}"`, 'WEB_PROVIDER_ERROR')
    }
    let result: WebFetchResult
    try {
      result = await primary.fetch(
        await this.providerContext(config, primaryName), request, signal,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const fallback = await this.tryFallback(config, request, signal, message)
      if (fallback !== undefined) return fallback
      throw new WebError(`${primaryName} 抓取失败：${message}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (result.statusCode >= ERROR_STATUS_THRESHOLD) {
      const fallback = await this.tryFallback(
        config, request, signal, `${primaryName} 返回 HTTP ${result.statusCode}`,
      )
      if (fallback !== undefined) return fallback
    }
    return { result, servedBy: primaryName }
  }

  /**
   * Attempt the configured fallback provider (default Jina — keyless).
   * Returns the fallback outcome, or undefined when no fallback applies.
   * A fallback that also fails throws a combined error.
   */
  private async tryFallback(
    config: Config,
    request: WebFetchRequest,
    signal: AbortSignal | undefined,
    primaryFailure: string,
  ): Promise<FetchOutcome | undefined> {
    const fallbackName = config.fallback
    if (fallbackName === config.adapter || fallbackName.length === 0) return undefined
    const fallback = await this.adapterFor(config, fallbackName)
    if (fallback === undefined) return undefined
    try {
      const result = await fallback.fetch(
        await this.providerContext(config, fallbackName), request, signal,
      )
      if (result.statusCode >= ERROR_STATUS_THRESHOLD) {
        throw new WebError(`fallback ${fallbackName} returned HTTP ${result.statusCode}`, 'WEB_PROVIDER_ERROR')
      }
      return { result, servedBy: fallbackName }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new WebError(
        `主服务商 ${config.adapter} 失败（${primaryFailure}），回退 ${fallbackName} 也失败：${message}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
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
      // is kept in the section even while disabled.
      proxy: config.proxyEnabled && config.proxy.length > 0 ? config.proxy : undefined,
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
