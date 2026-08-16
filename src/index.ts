/**
 * dsh-fetch-third-party — host half.
 *
 * Registers the `third-party` fetch provider, the settings section, the
 * self-contained `web_fetch_url` tool, and the settings bridge routes.
 * @module dsh-fetch-third-party
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'
import { FetchBudget } from './budget.ts'
import { mountFetchBridge } from './bridge.ts'
import { LocalStackManager } from './local-stack.ts'
import { ThirdPartyFetchProvider } from './provider.ts'
import {
  Config, DEFAULT_ADAPTER, DEFAULT_BASE_URL, DEFAULT_FALLBACK,
  DEFAULT_MAX_FETCHES, NAMESPACE,
} from './settings.ts'
import { applyWebFetchUrlTool } from './tool.ts'

export const name = 'dsh-fetch-third-party'

/**
 * Required services: web seam, credentials, tool registry, prompt sections.
 * `webServer` is deliberately NOT required: the settings bridge mounts only
 * where a web server exists (its own ctx.inject waits lazily), so the core
 * fetch capability works in headless/CLI surfaces too.
 */
export const inject = ['web', 'credentials', 'tools', 'systemPrompt'] as const

/** Mount the provider, its section, its tool, and its bridge. */
export function apply(ctx: Context, config: Config = DEFAULT_CONFIG): void {
  // The live section: the row config supplies defaults, user edits override.
  // The loader passes the raw row config (undefined when the row carries no
  // config block), so fall back to explicit defaults until the settings
  // section resolves. `current` is a STABLE reader over a mutable `section`
  // thunk: every consumer (provider, budget, bridge) receives `current` once
  // and still sees live values after setSource swaps the thunk.
  const base: Config = config ?? DEFAULT_CONFIG
  let section: () => Config = () => base
  const current: () => Config = () => section() ?? base

  // Auto-manages the local wrapper (and best-effort the Crawl4AI container)
  // while a loopback custom provider is the primary or fallback.
  const stack = new LocalStackManager(current)

  installSettingsSection(ctx, NAMESPACE, Config, base, {
    setSource: (source) => { section = source },
    // The section calls onChange at attach and on every change, which drives
    // the initial sync (start when the default is a loopback custom provider)
    // and keeps it in step with later switches.
    onChange: () => { void stack.sync() },
  })

  const budget = new FetchBudget(() => current().maxFetchesPerSession)
  const provider = new ThirdPartyFetchProvider(ctx, current, budget)
  ctx.web.registerFetchProvider(provider)
  applyWebFetchUrlTool(ctx)
  mountFetchBridge(ctx, current, (url) => provider.testFetch(url))

  // Kill the wrapper child when the plugin unloads (dsh web shuts down).
  ctx.effect(() => () => stack.shutdown())
}

/** Explicit defaults for a row without a config block. */
const DEFAULT_CONFIG: Config = {
  adapter: DEFAULT_ADAPTER,
  // Jina Reader as the keyless safety net whenever the primary fails.
  fallback: DEFAULT_FALLBACK,
  // Empty = adapter stock default (firecrawl → api.firecrawl.dev).
  baseURL: '',
  // Empty apiKeyEnv: the provider falls back to the adapter's standard ref.
  apiKeyEnv: '',
  maxFetchesPerSession: DEFAULT_MAX_FETCHES,
  // Empty proxy: direct connection unless the card sets one.
  proxy: '',
  // Proxy applies when a value is set (the card can toggle it off).
  proxyEnabled: true,
  customProviders: [],
}
