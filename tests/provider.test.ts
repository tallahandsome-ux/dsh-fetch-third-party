import { describe, expect, it } from 'vitest'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { MAX_CONTENT_CHARS, capContent } from '../src/provider.ts'

function textResult(content: string, truncated = false): WebFetchResult {
  return { url: 'https://a.com', statusCode: 200, body: { kind: 'text', content }, truncated }
}

describe('capContent', () => {
  it('passes through content within the cap', () => {
    const result = capContent(textResult('short body'))
    expect(result.body.content).toBe('short body')
    expect(result.truncated).toBe(false)
  })

  it('truncates oversized content at MAX_CONTENT_CHARS and marks it (H1)', () => {
    const big = 'x'.repeat(MAX_CONTENT_CHARS + 50)
    const result = capContent(textResult(big))
    expect(result.body.content.length).toBe(MAX_CONTENT_CHARS)
    expect(result.truncated).toBe(true)
  })

  it('preserves the original URL and status', () => {
    const result = capContent(textResult('hi'))
    expect(result.url).toBe('https://a.com')
    expect(result.statusCode).toBe(200)
  })

  it('keeps the html body kind when capping', () => {
    const big = 'y'.repeat(MAX_CONTENT_CHARS + 1)
    const result = capContent({ url: 'https://a.com', statusCode: 200, body: { kind: 'html', content: big }, truncated: false })
    expect(result.body.kind).toBe('html')
    expect(result.body.content.length).toBe(MAX_CONTENT_CHARS)
  })

  it('exactly-at-cap content is not truncated', () => {
    const exact = 'z'.repeat(MAX_CONTENT_CHARS)
    const result = capContent(textResult(exact))
    expect(result.truncated).toBe(false)
  })
})
