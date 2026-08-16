/**
 * Settings bridge: host HTTP routes the GUI card talks to.
 *
 * Why a bridge: the host-apiproxy serves a HARD-CODED settings allowlist
 * (`WEB_SETTINGS_NAMESPACES`), so a third-party settings namespace answers
 * `settings-not-exposed` on the wire. The card therefore reads and writes
 * this plugin's section through these own routes, which reach the settings
 * and credentials seams directly on the host. The server binds loopback by
 * default and the handlers re-check the peer address.
 * @module dsh-fetch-third-party/bridge
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
// Type-only: pulls the webServer Context merge from the host webserver package.
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { TestFetchResult } from './provider.ts'
import {
  resolveBaseURL, resolveKeyEnv, resolveProvider,
  type Config, type CustomProvider,
} from './settings.ts'
import { NAMESPACE } from './settings.ts'

/** Route prefix for this plugin's settings bridge. */
const BRIDGE_PREFIX = '/api/fetch-third-party'

/** Loopback peer addresses the bridge accepts (IPv4, IPv6, and mapped forms). */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** The card's view of the section plus the key's credential state. */
interface ConfigView {
  adapter: string
  fallback: string
  baseURL: string
  apiKeyEnv: string
  maxFetchesPerSession: number
  proxy: string
  proxyEnabled: boolean
  customProviders: CustomProvider[]
  cacheEnabled: boolean
  cacheTtlSeconds: number
  cacheMaxEntries: number
  rejectPrivateTargets: boolean
  writable: boolean
  apiKeyConfigured: boolean
  apiKeyWritable: boolean
}

/** One custom-provider list edit: add / update / remove / replace whole list. */
type CustomOp =
  | { op: 'add'; entry: CustomProvider }
  | { op: 'update'; entry: CustomProvider }
  | { op: 'remove'; name: string }
  | { op: 'replace'; entries: CustomProvider[] }

/** Mount the bridge routes (config read/write, key write, test, custom list). */
export function mountFetchBridge(
  ctx: Context,
  config: () => Config,
  test: (url: string) => Promise<TestFetchResult>,
): void {
  ctx.inject(['settings', 'credentials', 'webServer'], (sctx) => {
    sctx.effect(() => {
      const disposers = [
        sctx.webServer.register({
          kind: 'exact',
          path: `${BRIDGE_PREFIX}/config`,
          handler: (req, res) => void handleConfig(sctx, config, req, res),
        }),
        sctx.webServer.register({
          kind: 'exact',
          path: `${BRIDGE_PREFIX}/key`,
          handler: (req, res) => void handleKey(sctx, config, req, res),
        }),
        sctx.webServer.register({
          kind: 'exact',
          path: `${BRIDGE_PREFIX}/test`,
          handler: (req, res) => void handleTest(sctx, test, req, res),
        }),
        sctx.webServer.register({
          kind: 'exact',
          path: `${BRIDGE_PREFIX}/custom`,
          handler: (req, res) => void handleCustom(sctx, config, req, res),
        }),
      ]
      return () => { for (const dispose of disposers) dispose() }
    }, 'dsh-fetch-third-party: settings bridge')
  })
}

/** GET returns the current view; POST `{ field, value }` writes one field. */
async function handleConfig(
  ctx: Context,
  config: () => Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!loopbackPeer(req)) return sendJson(res, 403, { error: 'loopback-only' })
  if (req.method === 'GET') {
    return sendJson(res, 200, await viewOf(ctx, config))
  }
  if (req.method === 'POST') {
    const body = await readJson(req) as { field?: unknown; value?: unknown }
    if (typeof body.field !== 'string' || body.field.length === 0) {
      return sendJson(res, 400, { error: 'field required' })
    }
    try {
      await ctx.settings.update(NAMESPACE, { [body.field]: body.value })
    } catch (error) {
      return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
    return sendJson(res, 200, await viewOf(ctx, config))
  }
  return sendJson(res, 405, { error: 'method not allowed' })
}

/** POST `{ value }` writes the key; `{ unset: true }` removes it. The ref is the PRIMARY provider's. */
async function handleKey(
  ctx: Context,
  config: () => Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!loopbackPeer(req)) return sendJson(res, 403, { error: 'loopback-only' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
  const body = await readJson(req) as { value?: unknown; unset?: unknown }
  const refName = primaryKeyEnv(config())
  // Empty key ref = anonymous provider; there is no credential to write.
  if (refName.length === 0) {
    return sendJson(res, 400, { error: '当前服务商无需 API Key（匿名）' })
  }
  const ref = credentialRef(refName)
  try {
    if (body.unset === true) {
      await ctx.credentials.unset(ref)
    } else {
      if (typeof body.value !== 'string' || body.value.length === 0) {
        return sendJson(res, 400, { error: 'value required' })
      }
      await ctx.credentials.set(ref, body.value)
    }
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
  return sendJson(res, 200, await viewOf(ctx, config))
}

/** POST `{ url? }` runs a real fetch through the routing (consumes provider API quota). */
async function handleTest(
  ctx: Context,
  test: (url: string) => Promise<TestFetchResult>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!loopbackPeer(req)) return sendJson(res, 403, { error: 'loopback-only' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
  const body = await readJson(req) as { url?: unknown }
  const url = typeof body.url === 'string' && body.url.length > 0 ? body.url : 'https://example.com'
  if (!isHttpUrl(url)) {
    return sendJson(res, 400, { error: 'invalid test URL' })
  }
  return sendJson(res, 200, await test(url))
}

/** POST a custom-provider list edit (`add` / `update` / `remove` / `replace`). */
async function handleCustom(
  ctx: Context,
  config: () => Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!loopbackPeer(req)) return sendJson(res, 403, { error: 'loopback-only' })
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
  const body = await readJson(req) as Partial<CustomOp> & { op?: unknown }
  const current = config().customProviders
  let next: CustomProvider[]
  try {
    switch (body.op) {
      case 'add': {
        const entry = validateCustomEntry(body.entry)
        if (current.some(provider => provider.name === entry.name)) {
          throw new Error(`自定义服务商名称 "${entry.name}" 已存在`)
        }
        next = [...current, entry]
        break
      }
      case 'update': {
        const entry = validateCustomEntry(body.entry)
        if (!current.some(provider => provider.name === entry.name)) {
          throw new Error(`自定义服务商 "${entry.name}" 不存在`)
        }
        next = current.map(provider => provider.name === entry.name ? entry : provider)
        break
      }
      case 'remove': {
        if (typeof body.name !== 'string') throw new Error('name required for remove')
        next = current.filter(provider => provider.name !== body.name)
        break
      }
      case 'replace': {
        if (!Array.isArray(body.entries)) throw new Error('entries required for replace')
        const seen = new Set<string>()
        next = body.entries.map((entry, index) => {
          const valid = validateCustomEntry(entry)
          if (seen.has(valid.name)) throw new Error(`自定义服务商名称 "${valid.name}" 重复（第 ${index + 1} 项）`)
          seen.add(valid.name)
          return valid
        })
        break
      }
      default:
        return sendJson(res, 400, { error: 'op must be add|update|remove|replace' })
    }
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
  try {
    await ctx.settings.update(NAMESPACE, { customProviders: next })
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
  return sendJson(res, 200, await viewOf(ctx, config))
}

/** Compose the card's view: section values plus the key's credential state. */
async function viewOf(ctx: Context, config: () => Config): Promise<ConfigView> {
  const section = config()
  const keyEnv = primaryKeyEnv(section)
  let apiKeyConfigured = false
  let apiKeyWritable = false
  // Empty key ref = anonymous provider: no credential to describe.
  if (keyEnv.length > 0) {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const info = await credentials.describe(credentialRef(keyEnv))
      apiKeyConfigured = info.configured
      apiKeyWritable = info.writable
    }
  }
  return {
    adapter: section.adapter,
    fallback: section.fallback,
    baseURL: resolveBaseURL(section),
    apiKeyEnv: keyEnv,
    maxFetchesPerSession: section.maxFetchesPerSession,
    proxy: section.proxy,
    proxyEnabled: section.proxyEnabled,
    customProviders: section.customProviders,
    cacheEnabled: section.cacheEnabled,
    cacheTtlSeconds: section.cacheTtlSeconds,
    cacheMaxEntries: section.cacheMaxEntries,
    rejectPrivateTargets: section.rejectPrivateTargets,
    writable: true,
    apiKeyConfigured,
    apiKeyWritable,
  }
}

/** The credential reference of the section's PRIMARY provider (built-in or custom). */
function primaryKeyEnv(config: Config): string {
  const resolved = resolveProvider(config, config.adapter)
  if (resolved !== undefined) return resolved.apiKeyEnv
  return resolveKeyEnv(config)
}

/** Validate one custom entry: kebab-case unique name, http(s) URL, allowed adapter. */
function validateCustomEntry(raw: unknown): CustomProvider {
  if (typeof raw !== 'object' || raw === null) throw new Error('entry required')
  const entry = raw as Partial<CustomProvider>
  if (typeof entry.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
    throw new Error('名称需为 kebab-case（小写字母/数字/连字符）')
  }
  if (typeof entry.baseURL !== 'string' || !isHttpUrl(entry.baseURL)) {
    throw new Error('接口地址需为 http(s) URL')
  }
  const adapter = typeof entry.adapter === 'string' && entry.adapter.length > 0 ? entry.adapter : 'custom'
  if (adapter !== 'custom' && !['tavily', 'jina', 'firecrawl'].includes(adapter)) {
    throw new Error(`未知适配器 "${adapter}"（可选：custom / tavily / jina / firecrawl）`)
  }
  return {
    name: entry.name,
    adapter,
    baseURL: entry.baseURL,
    apiKeyEnv: typeof entry.apiKeyEnv === 'string' ? entry.apiKeyEnv : '',
  }
}

/** Whether a string is an absolute http(s) URL. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Reject requests whose peer is not loopback (defense in depth on top of the bind). */
function loopbackPeer(req: IncomingMessage): boolean {
  return LOOPBACK.has(req.socket.remoteAddress ?? '')
}

/** Drain the request body and parse JSON. */
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.length === 0) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

/** Write one JSON response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
