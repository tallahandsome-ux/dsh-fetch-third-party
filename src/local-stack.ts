/**
 * Local-stack manager for dsh-fetch-third-party.
 *
 * Auto-manages the contract-v1 wrapper process (scripts/crawl4ai-wrapper.mjs)
 * so a loopback custom provider (e.g. the bundled Crawl4AI stack) works right
 * after `dsh web` starts — no manual "docker run / node wrapper" commands.
 *
 * Trigger: the primary OR fallback provider is a custom entry whose baseURL is
 * a loopback address. While that holds, the manager (best-effort) ensures the
 * Crawl4AI container is up, spawns the wrapper on 127.0.0.1:8787, and runs a
 * real-time watchdog that restarts the wrapper (and re-checks the container)
 * if it dies — so a crashed process recovers without a dsh restart.
 *
 * The wrapper is spawned with a sanitized env (no HTTP(S)_PROXY), because it
 * only ever talks to the local container. On dispose / when the trigger no
 * longer holds, the watchdog is cleared and the wrapper child is killed.
 * @module dsh-fetch-third-party/local-stack
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config } from './settings.ts'

/** The wrapper's local port (matches the wrapper's WRAPPER_PORT default). */
const WRAPPER_PORT = 8787
/** The Crawl4AI container's published local port. */
const CRAWL4AI_PORT = 11235
const CONTAINER_NAME = 'crawl4ai'
const CONTAINER_IMAGE = 'unclecode/crawl4ai:latest'
/** Token used to create/start the container and authenticate the wrapper. */
const DEFAULT_TOKEN = 'dev-crawl4ai-token'
/** How often the watchdog re-checks the wrapper after it started. */
const WATCHDOG_MS = 20_000
/** Rate-limit repeated docker attempts when the container stays down. */
const CONTAINER_COOLDOWN_MS = 60_000

/** Whether a URL points at the loopback interface. */
export function isLoopbackURL(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '::1'
  } catch {
    return false
  }
}

/** The package root (…/fetch) from the built lib/index.js location. */
function packageRoot(): string {
  const here = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(here), '..')
}

/** The token: environment wins, otherwise the documented default. */
function resolveToken(): string {
  const fromEnv = process.env.CRAWL4AI_API_TOKEN?.trim()
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_TOKEN
}

/** Whether something is listening on 127.0.0.1:port (any HTTP response counts). */
async function isPortUp(port: number): Promise<boolean> {
  try {
    await fetch('http://127.0.0.1:' + port + '/', { signal: AbortSignal.timeout(1200) })
    return true
  } catch {
    return false
  }
}

/** Poll until a port answers or the timeout elapses. */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortUp(port)) return true
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return isPortUp(port)
}

/** Run a docker CLI command (best-effort). */
function docker(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { timeout: 90_000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()))
      else resolve()
    })
  })
}

/** The stack manager: owns the wrapper child process and its watchdog. */
export class LocalStackManager {
  private child: ChildProcess | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private syncing = false
  private starting = false
  private active = false
  private lastContainerAttempt = 0

  constructor(private readonly config: () => Config) {}

  /** Whether the current routing references a loopback custom provider. */
  needsLocal(config: Config = this.config()): boolean {
    const names = [config.adapter, config.fallback].filter((name) => name.length > 0)
    return names.some((name) => {
      const entry = config.customProviders.find((provider) => provider.name === name)
      return entry !== undefined && isLoopbackURL(entry.baseURL)
    })
  }

  /** Start the stack when needed, stop it when not. */
  async sync(): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    try {
      if (this.needsLocal()) {
        this.active = true
        await this.ensureContainer().catch((error) => {
          console.warn(
            '[dsh-fetch-third-party] Crawl4AI container ensure failed (fetch will fall back):',
            error instanceof Error ? error.message : error,
          )
        })
        await this.ensureWrapper()
        this.armWatchdog()
      } else {
        this.active = false
        this.shutdown()
      }
    } finally {
      this.syncing = false
    }
  }

  /** Start the periodic watchdog once (cleared in shutdown). */
  private armWatchdog(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => { void this.checkWrapper() }, WATCHDOG_MS)
    // Do not keep the host process alive just for the watchdog.
    this.timer.unref()
  }

  /** Real-time recovery: restart the wrapper when it died but is still needed. */
  private async checkWrapper(): Promise<void> {
    if (!this.active || this.syncing) return
    if (this.child !== null) return
    if (await isPortUp(WRAPPER_PORT)) return // still serving (user- or previous-started)
    await this.ensureContainer().catch((error) => {
      console.warn(
        '[dsh-fetch-third-party] Crawl4AI container ensure failed (fetch will fall back):',
        error instanceof Error ? error.message : error,
      )
    })
    await this.ensureWrapper()
  }

  /** Ensure the Crawl4AI container answers on its local port. */
  private async ensureContainer(): Promise<void> {
    if (await isPortUp(CRAWL4AI_PORT)) {
      this.lastContainerAttempt = 0
      return
    }
    // Rate-limit repeated docker attempts while the container stays down.
    const now = Date.now()
    if (now - this.lastContainerAttempt < CONTAINER_COOLDOWN_MS) return
    this.lastContainerAttempt = now
    const token = resolveToken()
    try {
      await docker(['start', CONTAINER_NAME])
    } catch {
      await docker([
        'run', '-d',
        '-p', '127.0.0.1:' + CRAWL4AI_PORT + ':' + CRAWL4AI_PORT,
        '--name', CONTAINER_NAME, '--shm-size=1g',
        '-e', 'CRAWL4AI_API_TOKEN=' + token,
        CONTAINER_IMAGE,
      ])
    }
    await waitForPort(CRAWL4AI_PORT, 60_000)
  }

  /** Ensure the contract-v1 wrapper answers on 127.0.0.1:8787. */
  private async ensureWrapper(): Promise<void> {
    if (this.child !== null || this.starting) return
    if (await isPortUp(WRAPPER_PORT)) return // already serving (user- or previous-started)
    this.starting = true
    try {
      const script = path.join(packageRoot(), 'scripts', 'crawl4ai-wrapper.mjs')
      if (!existsSync(script)) {
        console.warn('[dsh-fetch-third-party] wrapper script missing: ' + script)
        return
      }
      const child = spawn(process.execPath, [script], {
        env: {
          ...process.env,
          CRAWL4AI_API_TOKEN: resolveToken(),
          WRAPPER_PORT: String(WRAPPER_PORT),
          // The wrapper only talks to the local container: never proxy loopback.
          HTTP_PROXY: '',
          HTTPS_PROXY: '',
          NODE_USE_ENV_PROXY: '0',
          NO_PROXY: '*',
        },
        stdio: 'ignore',
        windowsHide: true,
      })
      child.on('exit', () => {
        if (this.child === child) this.child = null
        // Fast recovery after an unexpected exit (shutdown sets active=false first).
        setTimeout(() => { void this.checkWrapper() }, 1000)
      })
      this.child = child
      // Give it a moment to bind; failures surface on the next fetch.
      await waitForPort(WRAPPER_PORT, 15_000)
    } finally {
      this.starting = false
    }
  }

  /** Stop the watchdog and kill the wrapper child (if this manager spawned it). */
  shutdown(): void {
    this.active = false
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.child !== null) {
      const child = this.child
      this.child = null
      try { child.kill() } catch { /* already gone */ }
    }
  }
}
