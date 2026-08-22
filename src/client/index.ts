/**
 * The web-fetch settings card, browser half. Registers itself into the
 * plugin-configuration section's card slot; the official settings wire blocks
 * third-party namespaces (hard-coded allowlist), so the card talks to the
 * host-side bridge routes instead.
 * @module dsh-fetch-third-party/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the slot-system SlotMap / LocaleNamespaceMap merges.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { FetchCard } from './card.tsx'
import { en, zh, type FetchCardLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Fetch card copy. */
    'fetch-third-party': FetchCardLocaleKey
  }

  interface SlotMap {
    /**
     * The plugin configuration section's card seat, spelled here with the same
     * shape as the sibling UI package without depending on it.
     */
    'settings.plugin.item': { kind: 'keyed'; scope: 'root'; owner: FetchCardOwnerProps }
  }
}

/** Owner share of the fetch card (the card supplies nothing). */
export interface FetchCardOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Required client services. */
export const inject = ['slots', 'locale'] as const

/** Register the fetch settings card into the plugin-configuration section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('fetch-third-party', { zh, en }), 'fetch-third-party: dictionaries')

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'web-fetch-third-party',
    locale: 'fetch-third-party',
    inject: () => ({}),
  }, FetchCard))
}
