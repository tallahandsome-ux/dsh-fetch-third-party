import { describe, expect, it } from 'vitest'
import { resolveToolName } from '../src/tool.ts'

describe('resolveToolName', () => {
  it('web_fetch_url preference always keeps the safe name', () => {
    expect(resolveToolName('web_fetch_url', () => false)).toEqual({ name: 'web_fetch_url', fellBack: false })
    expect(resolveToolName('web_fetch_url', () => true)).toEqual({ name: 'web_fetch_url', fellBack: false })
  })

  it('web_fetch preference uses the official name when free', () => {
    expect(resolveToolName('web_fetch', () => false)).toEqual({ name: 'web_fetch', fellBack: false })
  })

  it('web_fetch preference falls back when the name is taken', () => {
    expect(resolveToolName('web_fetch', (n) => n === 'web_fetch')).toEqual({ name: 'web_fetch_url', fellBack: true })
  })

  it('auto prefers web_fetch when free, else web_fetch_url', () => {
    expect(resolveToolName('auto', () => false)).toEqual({ name: 'web_fetch', fellBack: false })
    expect(resolveToolName('auto', (n) => n === 'web_fetch')).toEqual({ name: 'web_fetch_url', fellBack: true })
  })
})
