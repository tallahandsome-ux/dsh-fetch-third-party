/**
 * Dynamic fallback chain: an ordered list of provider names with per-provider
 * cooldown state. A provider that fails — or exhausts its quota — enters
 * cooldown and drops out of rotation; when the cooldown expires it returns to
 * its configured position. This replaces the fixed primary→fallback pair with
 * an arbitrary-length, self-healing chain (the P3 "multi-level fallback" idea).
 * @module dsh-fetch-third-party/fallback
 */

/** Failure kind used to pick the cooldown length. */
export type FailureKind = 'quota' | 'normal'

/** Per-provider runtime state. */
interface ProviderState {
  consecutiveFailures: number
  cooldownUntil: number // epoch ms; 0 = not cooling
}

/** One row of the live chain snapshot (for the settings card). */
export interface ChainRow {
  name: string
  inCooldown: boolean
  remainingSec: number
}

/** Cooldown policy resolved from the section (seconds), read live. */
export interface CooldownPolicy {
  enabled: boolean
  quotaSeconds: number
  failureSeconds: number
}

/** Upper bound on the exponential failure backoff. */
const MAX_FAILURE_BACKOFF_SECONDS = 600

/**
 * Classify a failure as quota-exhaustion or a normal error.
 * @param error - the thrown error, if the failure was a throw.
 * @param statusCode - the HTTP status, if the failure was a bad result.
 */
export function classifyFailure(error: unknown, statusCode?: number): FailureKind {
  if (statusCode === 429 || statusCode === 402) return 'quota'
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /quota|rate.?limit|limit.reached|too many requests|额度|限流/i.test(message)
    ? 'quota'
    : 'normal'
}

/** The dynamic fallback chain router (one per configured chain). */
export class FallbackRouter {
  private readonly base: string[]
  private readonly state = new Map<string, ProviderState>()
  private order: string[]

  constructor(baseChain: string[], private readonly policy: () => CooldownPolicy) {
    this.base = [...baseChain]
    this.order = [...baseChain]
  }

  /**
   * The next provider to try: the first not in cooldown and not already tried,
   * after recovered cooldowns return to their base positions.
   * @param tried - names already attempted in this request.
   */
  next(tried: ReadonlySet<string>): string | undefined {
    this.reorder(Date.now())
    const ready = this.order.find((name) => this.remaining(name) === 0 && !tried.has(name))
    if (ready !== undefined) return ready
    // All ready providers are cooling or tried: fall through to the least-cooled
    // untried one so the chain stays usable instead of hard-blocking (cooldown is
    // a preference, not a hard gate — mirroring modsearch's move-to-back model).
    return this.order.find((name) => !tried.has(name))
  }

  /** Mark a failure; the provider cools down and drops to the back of rotation. */
  recordFailure(name: string, kind: FailureKind): void {
    if (!this.policy().enabled) return
    const state = this.state.get(name) ?? { consecutiveFailures: 0, cooldownUntil: 0 }
    state.consecutiveFailures += 1
    const seconds = kind === 'quota'
      ? this.policy().quotaSeconds
      : Math.min(this.policy().failureSeconds * 2 ** (state.consecutiveFailures - 1), MAX_FAILURE_BACKOFF_SECONDS)
    state.cooldownUntil = Date.now() + seconds * 1000
    this.state.set(name, state)
  }

  /** Mark a success; reset the consecutive-failure counter. */
  recordSuccess(name: string): void {
    const state = this.state.get(name)
    if (state !== undefined) state.consecutiveFailures = 0
  }

  /** Live order + cooldown state, for the settings card. */
  snapshot(now = Date.now()): ChainRow[] {
    this.reorder(now)
    return this.order.map((name) => {
      const remaining = Math.max(0, (this.state.get(name)?.cooldownUntil ?? 0) - now)
      return { name, inCooldown: remaining > 0, remainingSec: Math.ceil(remaining / 1000) }
    })
  }

  private remaining(name: string): number {
    const until = this.state.get(name)?.cooldownUntil ?? 0
    return Math.max(0, until - Date.now())
  }

  /** Available providers first (base order), cooling ones at the back. */
  private reorder(now: number): void {
    const cooled = this.order.filter((name) => Math.max(0, (this.state.get(name)?.cooldownUntil ?? 0) - now) > 0)
    this.order = this.base.filter((name) => !cooled.includes(name)).concat(cooled)
  }
}
