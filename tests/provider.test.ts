import { describe, expect, it } from 'vitest'
import type { WebFetchResult } from '@deepseek-ai/dsh-web'
import { DEFAULT_MAX_CONTENT_CHARS } from '../src/settings.ts'
import { capContent } from '../src/provider.ts'

function textResult(content: string, truncated = false): WebFetchResult {
  return { url: 'https://a.com', statusCode: 200, body: { kind: 'text', content }, truncated }
}

describe('capContent', () => {
  it('passes through content within the cap', () => {
    const result = capContent(textResult('short body'), DEFAULT_MAX_CONTENT_CHARS)
    expect(result.body.content).toBe('short body')
    expect(result.truncated).toBe(false)
  })

  it('truncates oversized content at the limit and marks it (H1)', () => {
    const big = 'x'.repeat(DEFAULT_MAX_CONTENT_CHARS + 50)
    const result = capContent(textResult(big), DEFAULT_MAX_CONTENT_CHARS)
    expect(result.body.content.length).toBe(DEFAULT_MAX_CONTENT_CHARS)
    expect(result.truncated).toBe(true)
  })

  it('honours a custom limit from the section', () => {
    const result = capContent(textResult('abcdefgh'), 5)
    expect(result.body.content).toBe('abcde')
    expect(result.truncated).toBe(true)
  })

  it('treats 0 as no cap', () => {
    const big = 'x'.repeat(DEFAULT_MAX_CONTENT_CHARS + 10)
    const result = capContent(textResult(big), 0)
    expect(result.body.content.length).toBe(big.length)
    expect(result.truncated).toBe(false)
  })

  it('preserves the original URL and status', () => {
    const result = capContent(textResult('hi'), DEFAULT_MAX_CONTENT_CHARS)
    expect(result.url).toBe('https://a.com')
    expect(result.statusCode).toBe(200)
  })

  it('keeps the html body kind when capping', () => {
    const big = 'y'.repeat(DEFAULT_MAX_CONTENT_CHARS + 1)
    const result = capContent({ url: 'https://a.com', statusCode: 200, body: { kind: 'html', content: big }, truncated: false }, DEFAULT_MAX_CONTENT_CHARS)
    expect(result.body.kind).toBe('html')
    expect(result.body.content.length).toBe(DEFAULT_MAX_CONTENT_CHARS)
  })

  it('exactly-at-limit content is not truncated', () => {
    const exact = 'z'.repeat(DEFAULT_MAX_CONTENT_CHARS)
    const result = capContent(textResult(exact), DEFAULT_MAX_CONTENT_CHARS)
    expect(result.truncated).toBe(false)
  })
})
