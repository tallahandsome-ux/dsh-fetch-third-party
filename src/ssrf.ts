/**
 * SSRF-hardening utilities: URL policy checks and IP range classification.
 *
 * The plugin itself runs a courier model (the target URL is fetched only by a
 * third-party service), but defense-in-depth still rejects private/reserved
 * targets the model asks for — a self-hosted Crawl4AI on the same machine
 * effectively bridges to the internal network. The functions here are also
 * exported so a second developer who builds a direct-connect provider can
 * reuse the same guards; see docs/ssrf-hardening.md for the full checklist.
 * @module dsh-fetch-third-party/ssrf
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { WebError } from '@deepseek-ai/dsh-web'

/** IPv4 ranges that must never be reached: [first, last] as unsigned 32-bit. */
const PRIVATE_IPV4: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8 unspecified
  [0x0a000000, 0x0affffff], // 10.0.0.0/8 private
  [0x64400000, 0x647fffff], // 100.64.0.0/10 CGNAT
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8 loopback
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 link-local
  [0xac100000, 0xac1fffff], // 172.16.0.0/12 private
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24 IETF protocol assignments
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16 private
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15 benchmarking
  [0xe0000000, 0xefffffff], // 224.0.0.0/4 multicast
  [0xf0000000, 0xffffffff], // 240.0.0.0/4 reserved
]

/** `new URL().hostname` keeps IPv6 brackets; strip them for isIP(). */
function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/** Parse a dotted-quad IPv4 into an unsigned 32-bit number, or undefined. */
function ipv4ToNumber(ip: string): number | undefined {
  const nums = ip.split('.').map(Number)
  if (nums.length !== 4) return undefined
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return undefined
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

/**
 * Whether an IP literal is private / reserved / loopback / link-local /
 * multicast / otherwise unroutable. Accepts IPv4, IPv6, IPv4-mapped IPv6
 * (::ffff:x.x.x.x) and 6to4 (2002:vvvv:vvvv::/16) with an embedded IPv4.
 * Non-IP input returns true (conservative).
 */
export function isPrivateOrReserved(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) {
    const n = ipv4ToNumber(ip)
    if (n === undefined) return true
    return PRIVATE_IPV4.some(([lo, hi]) => n >= lo && n <= hi)
  }
  if (family === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::' || lower === '::1') return true // unspecified / loopback
    if (lower.startsWith('::ffff:')) return isPrivateOrReserved(lower.slice(7)) // IPv4-mapped
    // Deprecated IPv4-compatible form (::a.b.c.d): the tail embeds an IPv4.
    if (lower.startsWith('::') && lower.includes('.')) return isPrivateOrReserved(lower.slice(2))
    if (lower.startsWith('ff')) return true // multicast ff00::/8
    const first = lower.split(':')[0]
    if (first !== undefined && first.length > 0) {
      const hextet = parseInt(first, 16)
      if (!Number.isNaN(hextet)) {
        if (hextet >= 0xfc00 && hextet <= 0xfdff) return true // ULA fc00::/7
        if (hextet >= 0xfe80 && hextet <= 0xfebf) return true // link-local fe80::/10
      }
    }
    if (lower.startsWith('2002:')) {
      // 6to4: the next two hextets encode the IPv4.
      const groups = lower.split(':')
      if (groups.length < 3) return true
      const a = parseInt(groups[1], 16)
      const b = parseInt(groups[2], 16)
      if (Number.isNaN(a) || Number.isNaN(b)) return true
      const v4 = ((a >> 8) & 0xff) + '.' + (a & 0xff) + '.' + ((b >> 8) & 0xff) + '.' + (b & 0xff)
      return isPrivateOrReserved(v4)
    }
    return false
  }
  return true
}

/**
 * Basic URL policy: absolute http(s), no embedded credentials.
 * @param raw - the URL to inspect.
 * @returns true when the URL is structurally acceptable.
 */
export function isHttpUrlPolicyCompliant(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false
  return true
}

/**
 * Lightweight target pre-check for the provider path: URL policy plus an
 * IP-literal private/reserved check. Hostnames are NOT resolved here — full
 * DNS resolution is the job of the third-party service (documented in
 * docs/ssrf-hardening.md); this is defense-in-depth, not a DNS-rebinding fix.
 * @param raw - the model-requested URL.
 * @throws {@link WebError} when the target is structurally or privately invalid.
 */
export function validateTargetURL(raw: string): void {
  if (!isHttpUrlPolicyCompliant(raw)) {
    throw new WebError('仅支持无凭据的 http(s) URL', 'WEB_PROVIDER_ERROR')
  }
  const host = stripBrackets(new URL(raw).hostname)
  if (isIP(host) !== 0 && isPrivateOrReserved(host)) {
    throw new WebError('内网/保留地址目标被拒绝：' + host, 'WEB_PROVIDER_ERROR')
  }
}

/**
 * Full check for direct-connect providers: URL policy plus DNS resolution of
 * every A/AAAA answer, each of which must be public. Use this (and pin the
 * connection to the validated addresses) when you connect to the target from
 * the local process.
 * @param raw - the URL to validate.
 * @returns true when every resolved address is public.
 */
export async function isPublicHttpURL(raw: string): Promise<boolean> {
  if (!isHttpUrlPolicyCompliant(raw)) return false
  const host = stripBrackets(new URL(raw).hostname)
  const family = isIP(host)
  if (family !== 0) return !isPrivateOrReserved(host)
  try {
    const answers = await lookup(host, { all: true, verbatim: true })
    if (answers.length === 0) return false
    return answers.every(({ address }) => !isPrivateOrReserved(address))
  } catch {
    return false
  }
}

/** Full-check variant that throws a {@link WebError} with the reason. */
export async function assertPublicHttpURL(raw: string): Promise<void> {
  if (!(await isPublicHttpURL(raw))) {
    throw new WebError('目标不是公网地址（或解析失败），已拒绝', 'WEB_PROVIDER_ERROR')
  }
}
