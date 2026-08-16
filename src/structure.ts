/**
 * Lightweight structuring of a fetched page's markdown/text content into
 * evidence the model can cite: title, heading outline, links, word count and
 * estimated reading time. Pure string work — no extra requests, no provider
 * metadata — so it behaves identically across every adapter.
 * @module dsh-fetch-third-party/structure
 */

/** Structured view of a fetched page. */
export interface StructuredContent {
  /** First H1 line, else the first non-empty line, when present. */
  title?: string
  /** Heading outline (H1–H3) extracted from markdown headings. */
  headings: string[]
  /** Absolute http(s) links found as markdown [text](url), deduplicated, capped. */
  links: string[]
  /** Number of whitespace-separated tokens. */
  wordCount: number
  /** Estimated reading time in seconds (200 wpm). */
  readingTimeSec: number
}

const MAX_LINKS = 50
const MAX_HEADINGS = 20
const WORDS_PER_MINUTE = 200

const HEADING_RE = /^(#{1,3})\s+(.+)$/gm
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g

/** Extract a structured outline from raw fetched content. */
export function structureContent(content: string): StructuredContent {
  const headings: string[] = []
  let match: RegExpExecArray | null
  HEADING_RE.lastIndex = 0
  while ((match = HEADING_RE.exec(content)) !== null && headings.length < MAX_HEADINGS) {
    const heading = match[2].trim()
    if (heading.length > 0) headings.push(heading)
  }

  const links: string[] = []
  const seen = new Set<string>()
  LINK_RE.lastIndex = 0
  while ((match = LINK_RE.exec(content)) !== null) {
    const url = match[1].trim()
    if (/^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url)
      links.push(url)
      if (links.length >= MAX_LINKS) break
    }
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  let title: string | undefined
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/)
    if (h1 !== null) {
      title = h1[1].trim()
      break
    }
  }
  if (title === undefined && lines.length > 0) {
    title = lines[0].slice(0, 120)
  }

  const wordCount = content.split(/\s+/).filter((token) => token.length > 0).length
  const readingTimeSec = Math.max(1, Math.ceil((wordCount / WORDS_PER_MINUTE) * 60))

  return { title, headings, links, wordCount, readingTimeSec }
}
