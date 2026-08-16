#!/usr/bin/env node
/**
 * Standalone Jina Reader verification for dsh-fetch-third-party acceptance.
 *
 * Usage (from the fetch project root):
 *   node scripts/verify-jina.mjs                      # anonymous (no key)
 *   node scripts/verify-jina.mjs "jina_..." https://example.com
 *
 * Exit 0 and print content head when the fetch works; nonzero otherwise.
 */

const key = process.argv[2] ?? process.env.JINA_API_KEY
const url = process.argv[3] ?? 'https://example.com'
const baseURL = (process.env.JINA_BASE_URL ?? 'https://r.jina.ai').replace(/\/+$/, '')

const endpoint = `${baseURL}/${encodeURIComponent(url)}`
const response = await fetch(endpoint, {
  method: 'GET',
  headers: {
    accept: 'application/json',
    ...key !== undefined && key.length > 0 ? { authorization: `Bearer ${key}` } : {},
  },
})

console.log(`HTTP ${response.status}`)
if (!response.ok) {
  console.error((await response.text()).slice(0, 500))
  process.exit(1)
}

let data
try {
  data = await response.json()
} catch {
  console.error('unparseable response')
  process.exit(1)
}

const content = data?.data?.content
if (typeof content !== 'string') {
  console.error(`no data.content; code=${data?.code} status=${data?.status}`)
  process.exit(1)
}

console.log(`url: ${data.data.url ?? url}`)
console.log(`content length: ${content.length}`)
console.log('--- head ---')
console.log(content.slice(0, 800))
process.exit(0)
