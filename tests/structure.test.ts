import { describe, expect, it } from 'vitest'
import { structureContent } from '../src/structure.ts'

describe('structureContent', () => {
  it('extracts title from the first H1', () => {
    const md = '# Hello World\n\nIntro text.\n## Section A'
    expect(structureContent(md).title).toBe('Hello World')
  })

  it('falls back to the first non-empty line', () => {
    expect(structureContent('Just a paragraph').title).toBe('Just a paragraph')
  })

  it('extracts H1-H3 headings in order', () => {
    const md = '## Two\n### Three\n# One\n#### Four'
    expect(structureContent(md).headings).toEqual(['Two', 'Three', 'One'])
  })

  it('treats blockquoted headings as headings', () => {
    const md = '> ## Quoted Section'
    expect(structureContent(md).headings).toEqual(['Quoted Section'])
  })

  it('extracts and dedups http(s) links only', () => {
    const md = '[a](https://a.com/x) [b](http://b.com) [c](https://a.com/x) [d](mailto:x@y.com) [e](relative)'
    const links = structureContent(md).links
    expect(links).toEqual(['https://a.com/x', 'http://b.com'])
  })

  it('caps links at 50', () => {
    const md = Array.from({ length: 60 }, (_, i) => '[l' + i + '](https://x.com/' + i + ')').join(' ')
    expect(structureContent(md).links.length).toBe(50)
  })

  it('counts words and estimates reading time', () => {
    const content = Array.from({ length: 400 }, () => 'word').join(' ')
    const s = structureContent(content)
    expect(s.wordCount).toBe(400)
    // 400 words at 200 wpm = 120s
    expect(s.readingTimeSec).toBe(120)
  })
})
