#!/usr/bin/env node
/**
 * Standalone Firecrawl verification for dsh-fetch-third-party acceptance.
 *
 * Usage (from the fetch project root):
 *   $env:FIRECRAWL_API_KEY="fc-..." ; node scripts/verify-firecrawl.mjs
 *   node scripts/verify-firecrawl.mjs "fc-..." https://example.com
 *
 * Exit 0 and print content head when the key works; nonzero otherwise.
 */

const key = process.argv[2] ?? process.env.FIRECRAWL_API_KEY
const url = process.argv[3] ?? 'https://example.com'
const baseURL = process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev'

if (key === undefined || key.length === 0) {
  console.error('missing FIRECRAWL_API_KEY (pass as argv[2] or env) — Firecrawl /scrape requires a key')
  process.exit(2)
}

const response = await fetch(`${baseURL}/v2/scrape`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ url, formats: ['markdown'] }),
})

console.log(`HTTP ${response.status}`)
const text = await response.text()
if (!response.ok) {
  console.error(text.slice(0, 500))
  process.exit(1)
}

let data
try {
  data = JSON.parse(text)
} catch {
  console.error('unparseable response')
  process.exit(1)
}

if (data.success !== true || data.data === undefined) {
  console.error(`scrape failed: ${JSON.stringify(data).slice(0, 500)}`)
  process.exit(1)
}

const content = data.data.markdown ?? ''
console.log(`url: ${data.data.metadata?.sourceURL ?? url}`)
console.log(`content length: ${content.length}`)
console.log('--- head ---')
console.log(String(content).slice(0, 800))
process.exit(0)
