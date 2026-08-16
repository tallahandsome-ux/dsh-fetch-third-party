#!/usr/bin/env node
/**
 * Contract-v1 fixture server for testing the custom provider path.
 *
 * Implements the contract from docs/contract.md:
 *   POST /  Body { "url": "<target>" }  →  200 { content, statusCode }
 *
 * Usage: node scripts/fixture-contract-server.mjs [port]  (default 8787)
 */

const port = Number(process.argv[2] ?? 8787)
const { createServer } = await import('node:http')

const server = createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405)
    return res.end('method not allowed')
  }
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    let url = ''
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed.url === 'string') url = parsed.url
    } catch {
      // fall through with empty url
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      content: `[fixture-contract-v1] fetched target: ${url || '(none)'}\n\nThis content came from the local contract-v1 fixture server, proving the custom provider path works end to end.`,
      statusCode: 200,
    }))
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`fixture-contract-v1 listening on http://127.0.0.1:${port}`)
})
