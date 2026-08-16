/**
 * Settings schema for the third-party fetch provider.
 *
 * The API key itself is NOT a section field: it lives only in the managed
 * credentials store, addressed by `apiKeyEnv`. The section holds the routing
 * (primary adapter + fallback), the endpoint, and the per-session budget cap.
 * @module dsh-fetch-third-party/settings
 */

import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** Settings namespace registered by this plugin (the GUI card binds to it). */
export const NAMESPACE = settingsNamespace('web-fetch-third-party')

/**
 * Built-in provider the section defaults to. Firecrawl is the default:
 * its `/v2/scrape` works even without a key (rate-limited), so a fresh
 * install fetches out of the box; the user picks their own default in the
 * card anyway.
 */
export const DEFAULT_ADAPTER = 'firecrawl'
/**
 * Fallback provider tried when the primary fails. Empty by default: the user
 * chooses their own fallback in the card (e.g. Jina, Tavily, a custom one).
 */
export const DEFAULT_FALLBACK = ''
/** Tavily API base; `/extract` is appended by the adapter. */
export const DEFAULT_BASE_URL = 'https://api.tavily.com'
/** Default per-session fetch budget. */
export const DEFAULT_MAX_FETCHES = 10

/**
 * Standard credential reference per adapter. The section's `apiKeyEnv` is
 * empty by default; the provider falls back to this table so switching the
 * adapter needs no manual key-reference editing. The GUI card sets
 * `apiKeyEnv` explicitly on adapter switch.
 */
export const KEY_ENV_BY_ADAPTER: Record<string, string> = {
  tavily: 'TAVILY_API_KEY',
  jina: 'JINA_API_KEY',
  firecrawl: 'FIRECRAWL_API_KEY',
}

/**
 * Standard endpoint per adapter, in the same fallback pattern as the key
 * reference: an empty section `baseURL` resolves to the adapter's default.
 * The GUI card rewrites `baseURL` when an adapter switch leaves a stale
 * default from the previous adapter.
 */
export const BASE_URL_BY_ADAPTER: Record<string, string> = {
  tavily: DEFAULT_BASE_URL,
  jina: 'https://r.jina.ai',
  firecrawl: 'https://api.firecrawl.dev',
}

/**
 * Resolve the effective endpoint for one adapter: the section's explicit
 * `baseURL` wins for the PRIMARY adapter; a fallback (or any other adapter)
 * always uses its own stock default, since the custom endpoint belongs to the
 * provider the user configured.
 * @param config - the resolved section.
 * @param adapter - the adapter to resolve for; defaults to the section's primary.
 * @returns the endpoint to call.
 */
export function resolveBaseURL(config: Config, adapter: string = config.adapter): string {
  if (adapter === config.adapter && config.baseURL.length > 0) return config.baseURL
  return BASE_URL_BY_ADAPTER[adapter] ?? DEFAULT_BASE_URL
}

/**
 * Resolve the effective credential reference for one adapter: the section's
 * explicit `apiKeyEnv` wins for the PRIMARY adapter; a fallback uses its own
 * standard ref.
 * @param config - the resolved section.
 * @param adapter - the adapter to resolve for; defaults to the section's primary.
 * @returns the reference name to address in the credentials store.
 */
export function resolveKeyEnv(config: Config, adapter: string = config.adapter): string {
  if (adapter === config.adapter && config.apiKeyEnv.length > 0) return config.apiKeyEnv
  return KEY_ENV_BY_ADAPTER[adapter] ?? 'TAVILY_API_KEY'
}

/** One user-registered custom provider instance. */
export interface CustomProvider {
  /** Unique kebab-case name; the primary/fallback fields reference it. */
  name: string
  /** Which adapter drives it: 'custom' (contract v1) or a built-in id. */
  adapter: string
  /** The custom endpoint. */
  baseURL: string
  /** Credential reference; empty = that adapter's standard ref (e.g. Jina anonymous). */
  apiKeyEnv: string
}

/** Schema for one custom provider entry. */
export const CustomProviderSchema = z.object({
  name: z.string(),
  adapter: z.string().default('custom'),
  baseURL: z.string(),
  apiKeyEnv: z.string().default(''),
})

/** The resolved call facts for one provider NAME (built-in or custom). */
export interface ResolvedProvider {
  /** The adapter driving this provider. */
  adapter: string
  /** The endpoint to call. */
  baseURL: string
  /** The credential reference to resolve. */
  apiKeyEnv: string
}

/**
 * Resolve one provider NAME (a built-in id like `jina`, or a custom entry's
 * name) into its call facts. The PRIMARY built-in keeps the section's flat
 * `baseURL`/`apiKeyEnv` overrides; any other built-in uses its stock defaults;
 * a custom entry uses its own table row.
 * @param config - the resolved section.
 * @param name - the provider name to resolve.
 * @returns the call facts, or undefined for an unknown provider.
 */
export function resolveProvider(config: Config, name: string): ResolvedProvider | undefined {
  if (BASE_URL_BY_ADAPTER[name] !== undefined || KEY_ENV_BY_ADAPTER[name] !== undefined) {
    const isPrimary = name === config.adapter
    return {
      adapter: name,
      baseURL: isPrimary ? resolveBaseURL(config, name) : BASE_URL_BY_ADAPTER[name] ?? DEFAULT_BASE_URL,
      apiKeyEnv: isPrimary ? resolveKeyEnv(config, name) : KEY_ENV_BY_ADAPTER[name] ?? 'TAVILY_API_KEY',
    }
  }
  const entry = config.customProviders.find(provider => provider.name === name)
  if (entry !== undefined) {
    return {
      adapter: entry.adapter || 'custom',
      baseURL: entry.baseURL,
      apiKeyEnv: entry.apiKeyEnv,
    }
  }
  return undefined
}

/** The section's resolved shape: routing, endpoint, budget cap, proxy. */
export interface Config {
  /** Primary provider (built-in id or custom name) performing the fetch. */
  adapter: string
  /** Fallback provider tried when the primary fails; default Jina (keyless). */
  fallback: string
  /** The primary built-in service base URL override. */
  baseURL: string
  /** Credential reference for the primary built-in; empty = its standard ref. */
  apiKeyEnv: string
  /** Per-session fetch budget cap. */
  maxFetchesPerSession: number
  /** Optional HTTP proxy (e.g. http://127.0.0.1:27822) for networks that block the service. */
  proxy: string
  /** Whether the proxy is applied; the address is kept even when disabled. */
  proxyEnabled: boolean
  /** User-registered custom provider instances (multi-custom coexistence). */
  customProviders: CustomProvider[]
}

/**
 * The section schema: non-secret wiring only (the key lives in credentials).
 * `adapter`/`fallback` stay open strings: the provider's adapter registry
 * rejects an unknown id at fetch time (`WEB_PROVIDER_ERROR`).
 */
export const Config: z<Config> = z.object({
  adapter: z.string().default(DEFAULT_ADAPTER),
  fallback: z.string().default(DEFAULT_FALLBACK),
  // Empty = the adapter's stock default (resolveBaseURL falls back); a non-empty
  // override only ever comes from the card or persisted settings.
  baseURL: z.string().default(''),
  apiKeyEnv: z.string().default(''),
  maxFetchesPerSession: z.natural().default(DEFAULT_MAX_FETCHES),
  proxy: z.string().default(''),
  proxyEnabled: z.boolean().default(true),
  customProviders: z.array(CustomProviderSchema).default([]),
})
