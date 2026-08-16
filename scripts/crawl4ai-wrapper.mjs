#!/usr/bin/env node
/**
 * Contract-v1 wrapper around a self-hosted Crawl4AI Docker API server.
 *
 * Turns Crawl4AI's /md endpoint into the fetch contract in docs/contract.md:
 *
 *   POST {baseURL}                 Authorization: Bearer <key>  (optional)
 *   Body: { "url": "<target>" }
 *   → 200 JSON { "content": "<markdown>", "statusCode": 200 }
 *
 * The plugin's built-in `custom` adapter (src/adapters/custom.ts) already
 * speaks this contract, so registering this wrapper as a custom provider in the
 * card (type = custom, address = http://127.0.0.1:<port>) makes Crawl4AI a
 * first-class "courier" for dsh-fetch-third-party — no plugin code changes.
 *
 * Uses Crawl4AI's purpose-built POST /md endpoint (Readability "fit" filter by
 * default) rather than the full async /crawl/job pipeline: one synchronous call
 * per URL, LLM-friendly markdown out. Set CRAWL4AI_FILTER to raw|bm25|llm to
 * change the extraction strategy.
 *
 * Environment:
 *   CRAWL4AI_BASE_URL   Crawl4AI API server (default http://127.0.0.1:11235)
 *   CRAWL4AI_API_TOKEN  Bearer token (v0.9+ requires auth; with no token the
 *                       server prints a one-off token at startup — set it here)
 *   CRAWL4AI_FILTER     extraction filter: fit|raw|bm25|llm (default fit)
 *   WRAPPER_PORT        port to listen on (default 8787)
 *   WRAPPER_TIMEOUT_MS  per-request timeout (default 60000)
 *
 * Usage:
 *   docker run -d -p 127.0.0.1:11235:11235 --name crawl4ai --shm-size=1g \
 *     -e CRAWL4AI_API_TOKEN=<token> unclecode/crawl4ai:latest
 *   CRAWL4AI_API_TOKEN=<token> node scripts/crawl4ai-wrapper.mjs
 */
import { createServer } from 'node:http'

const BASE_URL = (process.env.CRAWL4AI_BASE_URL ?? 'http://127.0.0.1:11235').replace(/\/+$/, '')
const API_TOKEN = process.env.CRAWL4AI_API_TOKEN ?? ''
const FILTER = process.env.CRAWL4AI_FILTER ?? 'fit'
const PORT = Number(process.env.WRAPPER_PORT ?? 8787)
const TIMEOUT_MS = Number(process.env.WRAPPER_TIMEOUT_MS ?? 60_000)

const authHeaders = API_TOKEN.length > 0
  ? { authorization: `Bearer ${API_TOKEN}` }
  : {}

/**
 * Fetch one URL's markdown through Crawl4AI /md.
 * Throws on network, auth, or crawl failure.
 */
async function fetchMarkdown(target) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${BASE_URL}/md`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify({ url: target, f: FILTER }),
      signal: controller.signal,
    })
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError'
      ? `超时（>${TIMEOUT_MS}ms）`
      : error instanceof Error ? error.message : String(error)
    throw new Error(`Crawl4AI 不可达：${reason}`)
  } finally {
    clearTimeout(timer)
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`Crawl4AI HTTP ${response.status}：${text.slice(0, 300)}`)
  }
  let data
  try { data = JSON.parse(text) } catch { data = null }
  const markdown = typeof data?.markdown === 'string' ? data.markdown : ''
  if (markdown.length === 0) {
    throw new Error(`Crawl4AI 未返回 markdown：${text.slice(0, 300)}`)
  }
  return markdown
}

const server = createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ error: 'method not allowed (POST only)' }))
  }
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    let url = ''
    try { url = JSON.parse(body).url ?? '' } catch { /* empty */ }
    if (typeof url !== 'string' || url.length === 0) {
      res.writeHead(400, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'body must be { "url": "<target>" }' }))
    }
    fetchMarkdown(url)
      .then((content) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ content, statusCode: 200 }))
      })
      .catch((error) => {
        // Contract v1: a failure still returns HTTP 200 + empty content so the
        // plugin surfaces it as a "result" the model can see (see contract.md).
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          content: '',
          statusCode: 502,
          error: error instanceof Error ? error.message : String(error),
        }))
      })
  })
  req.on('error', () => {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'bad request' }))
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`crawl4ai-wrapper listening on http://127.0.0.1:${PORT}`)
  console.log(`  → Crawl4AI ${BASE_URL}/md (filter=${FILTER}, token=${API_TOKEN ? 'configured' : 'NONE'})`)
})
