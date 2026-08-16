# AGENTS.md — for AI agents working in dsh-fetch-third-party

## Project

A DeepSeek Harness (dsh) plugin giving models **safe web fetching**: page retrieval is delegated to user-configured third-party services (Tavily / Jina Reader / Firecrawl / custom contract-v1 services), so the local machine never connects to the target URL directly (no SSRF surface). It also ships a per-session budget, an in-process LRU+TTL fetch cache, SSRF defense-in-depth, a dynamic fallback chain with cooldown, structured fetch output, a GUI settings card, and an auto-managed local Crawl4AI stack with a watchdog.

## Repository

- Repo: `https://github.com/tallahandsome-ux/dsh-fetch-third-party` (public, MIT)
- Branch: `main` (tags mark releases, e.g. `v1.0.0`)
- Docs: `docs/contract.md` (custom-service contract v1), `docs/custom-crawler-research.md` (crawler selection), `docs/ssrf-hardening.md` (SSRF checklist for direct-connect second-dev)

## Commands (repo root)

```bash
pnpm build       # tsdown → lib/index.js (Host) + lib/client.js (browser card)
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
```

## Layout

- `src/index.ts` — plugin entry: wires provider / settings section / tool / bridge / local-stack
- `src/provider.ts` — `ThirdPartyFetchProvider`: routing chain, budget, cache, SSRF pre-check
- `src/settings.ts` — the config schema (single source of truth for config fields)
- `src/bridge.ts` — settings bridge routes `/api/fetch-third-party/*` (GUI card <-> host)
- `src/tool.ts` — the `web_fetch_url` model tool (configurable name, conflict fallback)
- `src/fallback.ts` — dynamic fallback chain (quota/failure cooldown, exponential backoff)
- `src/cache.ts` — LRU+TTL fetch cache
- `src/ssrf.ts` — SSRF utilities (exported; used by the provider pre-check)
- `src/structure.ts` — structured output extraction (title/headings/links/stats)
- `src/local-stack.ts` — auto-manages the Crawl4AI container + wrapper (watchdog)
- `src/adapters/` — tavily / jina / firecrawl / custom (contract v1)
- `src/client/` — the GUI settings card (React)
- `tests/` — vitest unit tests

## Non-negotiables (do not break)

- **Courier model**: the plugin must never fetch the target URL from the local process; retrieval goes only through a configured third-party service or the local Crawl4AI stack.
- **Secrets**: API keys live ONLY in the user credentials store (`~/.dsh/.credentials.yaml`), keyed by env-reference name; never commit keys/tokens/personal paths. Verify scripts read keys from env/argv only.
- **Config additions**: a new setting must touch `src/settings.ts` (interface + schema), `src/index.ts` (DEFAULT_CONFIG), the bridge `viewOf` if the card shows it, card/locales if there is UI, and a test.
- **Tool output compatibility**: `web_fetch_url` output schema keeps `url` / `statusCode` / `content` required; new fields are optional additions.
- **CI**: GitHub Actions runs typecheck + test on every push; keep it green.

## Verifying a change

1. `pnpm typecheck && pnpm test && pnpm build`
2. Commit on `main` and push (the machine has git proxy + credentials configured).
3. The running dsh web loads the plugin from the local working copy: restart `dsh web` for Host changes; hard-refresh (Ctrl+F5) for the card.
4. GUI checks: Settings → Plugins → Plugin configuration → “Web fetch (third party)” card; `POST /api/fetch-third-party/test`; `GET /api/fetch-third-party/chain` shows the live fallback chain.

## Machine-specific facts (do NOT commit these)

- The local working copy path, the git proxy address, the GitHub credential storage, and the plugin install location are machine-specific — keep them out of the repository.
- If you need them, the operator can provide them; this file stays portable.
