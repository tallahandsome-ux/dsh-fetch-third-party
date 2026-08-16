#!/usr/bin/env node
/**
 * Standalone Tavily key verification for dsh-fetch-third-party acceptance.
 *
 * Usage (from the fetch project root):
 *   $env:TAVILY_API_KEY="tvly-..." ; node scripts/verify-tavily.mjs
 *   node scripts/verify-tavily.mjs "tvly-..." https://example.com
 *
 * Exit 0 and print content head when the key works; nonzero otherwise.
 */

const key = process.argv[2] ?? process.env.TAVILY_API_KEY
const url = process.argv[3] ?? 'https://example.com'
const baseURL = process.env.TAVILY_BASE_URL ?? 'https://api.tavily.com'

if (key === undefined || key.length === 0) {
  console.error('missing TAVILY_API_KEY (pass as argv[2] or env)')
  process.exit(2)
}

const response = await fetch(`${baseURL}/extract`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ urls: [url], extract_depth: 'basic' }),
})

const text = await response.text()
console.log(`HTTP ${response.status}`)

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

const result = data.results?.[0]
if (result === undefined) {
  console.error(`no result; failed_results=${JSON.stringify(data.failed_results ?? [])}`)
  process.exit(1)
}

const content = result.raw_content ?? result.content ?? ''
console.log(`url: ${result.url}`)
console.log(`content length: ${content.length}`)
console.log('--- head ---')
console.log(content.slice(0, 800))
process.exit(0)
