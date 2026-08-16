/**
 * Per-session fetch budget: a local gate, never sent to the third party.
 *
 * Every tool call (success or failure) consumes one unit. When a session
 * reaches the configured cap, further calls are refused with a clear error.
 * The cap is read live from the settings section, so raising it in the card
 * takes effect on the next call without a restart.
 * @module dsh-fetch-third-party/budget
 */

/** Outcome of one acquisition attempt. */
export type BudgetAcquire =
  | { ok: true }
  | { ok: false; limit: number }

/** Upper bound on tracked sessions before the oldest counts are pruned. */
const MAX_TRACKED_SESSIONS = 4096

/**
 * Counts fetch attempts per session id. Sessions without an id (direct
 * provider calls outside an agent) are not budgeted — there is no session
 * lifetime to attribute them to.
 */
export class FetchBudget {
  private readonly counts = new Map<string, number>()

  constructor(private readonly limit: () => number) {}

  /**
   * Reserve one fetch for `sessionId`, refusing once the cap is reached.
   * @param sessionId - the initiating agent's session id, or undefined.
   * @returns ok, or the limit that was hit.
   */
  tryAcquire(sessionId: string | undefined): BudgetAcquire {
    if (sessionId === undefined) return { ok: true }
    const limit = this.limit()
    if (limit <= 0) return { ok: true }
    // Bound the map: a long-lived host process must not grow unbounded with
    // session ids. Prune the oldest-tracked sessions when a NEW one arrives;
    // a pruned session simply starts a fresh count on its next fetch (which
    // matches "new session" semantics — it had been idle long enough).
    if (this.counts.size >= MAX_TRACKED_SESSIONS && !this.counts.has(sessionId)) {
      let over = this.counts.size - MAX_TRACKED_SESSIONS + 1
      for (const key of this.counts.keys()) {
        if (over <= 0) break
        this.counts.delete(key)
        over -= 1
      }
    }
    const count = this.counts.get(sessionId) ?? 0
    if (count >= limit) return { ok: false, limit }
    this.counts.set(sessionId, count + 1)
    return { ok: true }
  }

  /** Drop a session's count (new session, or explicit reset). */
  reset(sessionId: string): void {
    this.counts.delete(sessionId)
  }
}
