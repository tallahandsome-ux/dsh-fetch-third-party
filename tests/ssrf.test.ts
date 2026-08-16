import { describe, expect, it } from 'vitest'
import {
  isHttpUrlPolicyCompliant, isPrivateOrReserved, isPublicHttpURL,
  validateTargetURL,
} from '../src/ssrf.ts'

describe('isPrivateOrReserved', () => {
  it('flags IPv4 private/reserved ranges', () => {
    expect(isPrivateOrReserved('10.0.0.1')).toBe(true)
    expect(isPrivateOrReserved('172.16.0.1')).toBe(true)
    expect(isPrivateOrReserved('172.31.255.255')).toBe(true)
    expect(isPrivateOrReserved('192.168.1.1')).toBe(true)
    expect(isPrivateOrReserved('127.0.0.1')).toBe(true)
    expect(isPrivateOrReserved('169.254.1.1')).toBe(true)
    expect(isPrivateOrReserved('224.0.0.1')).toBe(true)
    expect(isPrivateOrReserved('0.0.0.0')).toBe(true)
    expect(isPrivateOrReserved('100.64.0.1')).toBe(true)
    expect(isPrivateOrReserved('198.18.0.1')).toBe(true)
    expect(isPrivateOrReserved('240.0.0.1')).toBe(true)
  })

  it('passes public IPv4', () => {
    expect(isPrivateOrReserved('8.8.8.8')).toBe(false)
    expect(isPrivateOrReserved('1.1.1.1')).toBe(false)
  })

  it('flags IPv6 special ranges and mapped forms', () => {
    expect(isPrivateOrReserved('::1')).toBe(true)
    expect(isPrivateOrReserved('::')).toBe(true)
    expect(isPrivateOrReserved('fe80::1')).toBe(true)
    expect(isPrivateOrReserved('fc00::1')).toBe(true)
    expect(isPrivateOrReserved('fd00::1')).toBe(true)
    expect(isPrivateOrReserved('ff02::1')).toBe(true)
    expect(isPrivateOrReserved('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrReserved('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateOrReserved('::ffff:8.8.8.8')).toBe(false)
    // 6to4 embedding 127.0.0.1 → 2002:7f00:0001::
    expect(isPrivateOrReserved('2002:7f00:0001::1')).toBe(true)
    expect(isPrivateOrReserved('2002:0808:0808::1')).toBe(false)
  })

  it('is conservative for non-IP input', () => {
    expect(isPrivateOrReserved('example.com')).toBe(true)
  })
})

describe('isHttpUrlPolicyCompliant', () => {
  it('accepts plain http(s)', () => {
    expect(isHttpUrlPolicyCompliant('https://example.com/a')).toBe(true)
    expect(isHttpUrlPolicyCompliant('http://example.com/a')).toBe(true)
  })

  it('rejects other protocols and embedded credentials', () => {
    expect(isHttpUrlPolicyCompliant('file:///etc/passwd')).toBe(false)
    expect(isHttpUrlPolicyCompliant('ftp://example.com/x')).toBe(false)
    expect(isHttpUrlPolicyCompliant('https://user:pass@example.com/')).toBe(false)
    expect(isHttpUrlPolicyCompliant('not a url')).toBe(false)
  })
})

describe('validateTargetURL', () => {
  it('throws on private IP-literal targets', () => {
    expect(() => validateTargetURL('http://127.0.0.1:8787/')).toThrow(/内网/)
    expect(() => validateTargetURL('http://192.168.1.1/')).toThrow(/内网/)
    expect(() => validateTargetURL('http://[::1]/')).toThrow(/内网/)
  })

  it('passes public targets', () => {
    expect(() => validateTargetURL('https://example.com/')).not.toThrow()
    expect(() => validateTargetURL('https://8.8.8.8/')).not.toThrow()
  })

  it('throws on non-http or credentialed urls', () => {
    expect(() => validateTargetURL('file:///etc/passwd')).toThrow()
    expect(() => validateTargetURL('https://u:p@example.com/')).toThrow()
  })
})

describe('isPublicHttpURL', () => {
  it('IP literals skip DNS', async () => {
    expect(await isPublicHttpURL('https://8.8.8.8/')).toBe(true)
    expect(await isPublicHttpURL('https://127.0.0.1/')).toBe(false)
    expect(await isPublicHttpURL('https://[::1]/')).toBe(false)
  })

  it('rejects policy violations without resolving', async () => {
    expect(await isPublicHttpURL('ftp://8.8.8.8/')).toBe(false)
    expect(await isPublicHttpURL('https://u:p@8.8.8.8/')).toBe(false)
  })

  it('resolves a real hostname to a public address', async () => {
    expect(await isPublicHttpURL('https://example.com/')).toBe(true)
  })
})
