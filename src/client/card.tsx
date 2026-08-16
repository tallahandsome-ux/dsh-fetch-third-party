/**
 * The web-fetch settings card (P4 complete version).
 *
 * Self-contained: manages its own state and talks to the host bridge
 * (`/api/fetch-third-party/*`) — no dependency on the official settings
 * scope (blocked for third-party namespaces) or the connection client.
 *
 * Layout: header (collapse) → level 1 (provider + proxy + test) → level 2
 * (endpoint + cap + API key + fallback) → custom providers editor.
 * @module dsh-fetch-third-party/client/card
 */

import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** One user-registered custom provider (mirror of the host type). */
interface CustomProvider {
  name: string
  adapter: string
  baseURL: string
  apiKeyEnv: string
}

/** The card's view of the section plus the key's credential state. */
interface ConfigView {
  adapter: string
  fallback: string
  baseURL: string
  apiKeyEnv: string
  maxFetchesPerSession: number
  proxy: string
  proxyEnabled: boolean
  customProviders: CustomProvider[]
  cacheEnabled: boolean
  cacheTtlSeconds: number
  cacheMaxEntries: number
  writable: boolean
  apiKeyConfigured: boolean
  apiKeyWritable: boolean
}

/** Result of the connection test. */
interface TestResult {
  ok: boolean
  servedBy: string
  statusCode?: number
  contentLength?: number
  durationMs: number
  error?: string
}

/** Props bound by the slot renderer: the registered locale namespace's `t`. */
export type FetchCardProps = PropsLocale<'fetch-third-party'>

const CONFIG_URL = '/api/fetch-third-party/config'
const KEY_URL = '/api/fetch-third-party/key'
const TEST_URL = '/api/fetch-third-party/test'
const CUSTOM_URL = '/api/fetch-third-party/custom'

/** The built-in service-provider options (custom names are appended). */
const ADAPTER_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'tavily', label: 'Tavily' },
  { id: 'jina', label: 'Jina Reader' },
  { id: 'firecrawl', label: 'Firecrawl' },
]

/** The adapter choices a custom provider row may pick. */
const CUSTOM_ADAPTER_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'custom', label: 'custom（契约 v1）' },
  { id: 'jina', label: 'jina（复用）' },
  { id: 'tavily', label: 'tavily（复用）' },
  { id: 'firecrawl', label: 'firecrawl（复用）' },
]

/** Standard credential reference each built-in adapter defaults to (card-side mirror). */
const KEY_ENV_BY_ADAPTER: Record<string, string> = {
  tavily: 'TAVILY_API_KEY',
  jina: 'JINA_API_KEY',
  firecrawl: 'FIRECRAWL_API_KEY',
}

/** Standard endpoint each built-in adapter defaults to (card-side mirror). */
const BASE_URL_BY_ADAPTER: Record<string, string> = {
  tavily: 'https://api.tavily.com',
  jina: 'https://r.jina.ai',
  firecrawl: 'https://api.firecrawl.dev',
}

/** Render the fetch settings card. */
export function FetchCard(props: FetchCardProps) {
  const { t } = props
  const [view, setView] = useState<ConfigView | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(true)
  const [l2Open, setL2Open] = useState(true)
  const [testUrl, setTestUrl] = useState('https://example.com')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [customsOpen, setCustomsOpen] = useState(false)
  const [customs, setCustoms] = useState<CustomProvider[]>([])

  const load = async (): Promise<void> => {
    try {
      const res = await fetch(CONFIG_URL)
      if (res.ok) {
        const next = await res.json() as ConfigView
        setView(next)
        setCustoms(next.customProviders)
      }
    } catch {
      // Keep the last known view; the card stays usable for retries.
    }
  }

  useEffect(() => { void load() }, [])

  const saveField = async (field: string, value: unknown): Promise<void> => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(CONFIG_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field, value }),
      })
      if (res.ok) {
        const next = await res.json() as ConfigView
        setView(next)
        setCustoms(next.customProviders)
        setMessage(t('saveSuccess'))
      } else {
        setMessage(t('saveFailed'))
      }
    } catch {
      setMessage(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const saveKey = async (value: string): Promise<void> => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(KEY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (res.ok) {
        const body = await res.json() as ConfigView
        setKeyInput('')
        setView(body)
        setMessage(t('saveSuccess'))
      } else {
        setMessage(t('saveFailed'))
      }
    } catch {
      setMessage(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(KEY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unset: true }),
      })
      if (res.ok) {
        const body = await res.json() as ConfigView
        setKeyInput('')
        setView(body)
        setMessage(t('saveSuccess'))
      } else {
        setMessage(t('saveFailed'))
      }
    } catch {
      setMessage(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(TEST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: testUrl }),
      })
      if (res.ok) {
        setTestResult(await res.json() as TestResult)
      } else {
        const body = await res.json().catch(() => null) as { error?: string } | null
        setTestResult({ ok: false, servedBy: '', durationMs: 0, error: body?.error ?? res.status.toString() })
      }
    } catch (error) {
      setTestResult({ ok: false, servedBy: '', durationMs: 0, error: String(error) })
    } finally {
      setTesting(false)
    }
  }

  const saveCustoms = async (): Promise<void> => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(CUSTOM_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'replace', entries: customs }),
      })
      if (res.ok) {
        const next = await res.json() as ConfigView
        setView(next)
        setCustoms(next.customProviders)
        setMessage(t('saveSuccess'))
      } else {
        const body = await res.json().catch(() => null) as { error?: string } | null
        setMessage(body?.error ?? t('saveFailed'))
      }
    } catch {
      setMessage(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (view === null) {
    return <p style={{ padding: '12px 16px', color: '#888' }}>{t('loading')}</p>
  }

  const disabled = !view.writable || saving

  const updateCustom = (index: number, patch: Partial<CustomProvider>): void => {
    setCustoms(prev => prev.map((entry, i) => i === index ? { ...entry, ...patch } : entry))
  }

  const addCustom = (): void => {
    setCustoms(prev => [
      ...prev,
      { name: `custom-${prev.length + 1}`, adapter: 'custom', baseURL: '', apiKeyEnv: '' },
    ])
  }

  const removeCustom = (index: number): void => {
    setCustoms(prev => prev.filter((_, i) => i !== index))
  }

  const providerOptions = [
    ...ADAPTER_OPTIONS,
    ...view.customProviders.map(entry => ({ id: entry.name, label: entry.name })),
  ]

  /** Whether the primary provider is a user-registered custom one (vs a built-in id). */
  const isCustomPrimary = !ADAPTER_OPTIONS.some(option => option.id === view.adapter)

  /** The custom entry backing the primary (when isCustomPrimary), for endpoint edits. */
  const customEntry = view.customProviders.find(entry => entry.name === view.adapter)

  /** The endpoint shown/edited in the 接口地址 field. */
  const displayBaseURL = isCustomPrimary ? (customEntry?.baseURL ?? '') : view.baseURL

  /** Save the 接口地址 field: custom primaries update their own entry, built-ins the flat baseURL. */
  const saveBaseURL = async (value: string): Promise<void> => {
    if (!isCustomPrimary) return saveField('baseURL', value)
    const entry = view.customProviders.find(provider => provider.name === view.adapter)
    if (entry === undefined) return
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch(CUSTOM_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'update', entry: { ...entry, baseURL: value } }),
      })
      if (res.ok) {
        const next = await res.json() as ConfigView
        setView(next)
        setCustoms(next.customProviders)
        setMessage(t('saveSuccess'))
      } else {
        const body = await res.json().catch(() => null) as { error?: string } | null
        setMessage(body?.error ?? t('saveFailed'))
      }
    } catch {
      setMessage(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const styles = {
    wrap: { padding: '12px 16px', display: 'grid', gap: '10px', maxWidth: 560 } as const,
    header: {
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0,
      border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
    } as const,
    title: { margin: 0, fontSize: 15, fontWeight: 600, flex: 1 } as const,
    chevron: { fontSize: 11, color: '#888' } as const,
    keyBadge: { fontSize: 12, padding: '2px 8px', borderRadius: 10, color: '#fff' } as const,
    desc: { margin: 0, fontSize: 13, color: '#888' } as const,
    section: {
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0,
      border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
      borderTop: '1px solid #eee', paddingTop: 10,
    } as const,
    sectionLabel: { margin: 0, fontSize: 12, fontWeight: 600, color: '#444', flex: 1 } as const,
    sectionBody: { display: 'grid', gap: '10px' } as const,
    field: { display: 'grid', gap: 4 } as const,
    label: { fontSize: 12, color: '#666' } as const,
    hint: { margin: 0, fontSize: 11, color: '#999' } as const,
    input: { padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 } as const,
    button: { padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: '#4f6ef7', color: '#fff' } as const,
    buttonGhost: { padding: '4px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#fff', color: '#555' } as const,
    row: { display: 'grid', gap: 6, padding: 8, border: '1px solid #eee', borderRadius: 8 } as const,
    rowHeader: { display: 'flex', alignItems: 'center', gap: 8 } as const,
    inline: { flex: 1 } as const,
    msg: { margin: 0, fontSize: 12, color: '#888' } as const,
    testOk: { margin: 0, fontSize: 12, color: '#2e9e5b' } as const,
    testFail: { margin: 0, fontSize: 12, color: '#c0392b' } as const,
    warn: { margin: 0, fontSize: 11, color: '#b58900' } as const,
    info: { margin: 0, fontSize: 11, color: '#888', lineHeight: 1.5 } as const,
  }

  return (
    <div style={styles.wrap}>
      <button style={styles.header} onClick={() => setOpen(prev => !prev)} aria-expanded={open}>
        <h3 style={styles.title}>{t('title')}</h3>
        <span
          style={{
            ...styles.keyBadge,
            background: view.apiKeyConfigured ? '#2e9e5b' : '#b0b0b0',
          }}
        >
          {view.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset')}
        </span>
        <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          <p style={styles.desc}>{t('description')}</p>

          {/* ── 第一级：服务商 + 代理 + 测试 ── */}
          <button style={styles.section} aria-expanded="true">
            <span style={styles.sectionLabel}>{t('level1')}</span>
          </button>
          <div style={styles.sectionBody}>
            <label style={styles.field}>
              <span style={styles.label}>{t('defaultProvider')}</span>
              <select
                style={styles.input}
                value={view.adapter}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.value
                  void saveField('adapter', next)
                  // Built-ins auto-align key ref + endpoint; custom names
                  // carry their own from the custom table.
                  const keyEnv = KEY_ENV_BY_ADAPTER[next]
                  if (keyEnv !== undefined && view.apiKeyEnv !== keyEnv) {
                    void saveField('apiKeyEnv', keyEnv)
                  }
                  // Align the flat endpoint to the new built-in's default when the
                  // current value is auto-managed (empty / a stock default) — this also
                  // covers custom→built-in, where the flat field still holds a stale
                  // default from the previous built-in.
                  const nextDefault = BASE_URL_BY_ADAPTER[next]
                  if (nextDefault !== undefined) {
                    const wasCustom = !ADAPTER_OPTIONS.some(option => option.id === view.adapter)
                    const stockDefaults = Object.values(BASE_URL_BY_ADAPTER)
                    if (wasCustom || view.baseURL.length === 0 || stockDefaults.includes(view.baseURL)) {
                      void saveField('baseURL', nextDefault)
                    }
                  }
                }}
              >
                {providerOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <p style={styles.hint}>{t('adapterHint')}</p>
            </label>

            <label style={styles.field}>
              <span style={styles.label}>{t('proxy')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  style={{ ...styles.input, flex: 1 }}
                  value={view.proxy}
                  disabled={disabled || !view.proxyEnabled}
                  placeholder="http://127.0.0.1:27822"
                  onChange={(event) => setView(prev => prev ? { ...prev, proxy: event.target.value } : prev)}
                  onBlur={(event) => void saveField('proxy', event.target.value)}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={view.proxyEnabled}
                    disabled={disabled}
                    onChange={(event) => void saveField('proxyEnabled', event.target.checked)}
                  />
                  {t('proxyEnable')}
                </label>
              </div>
              <p style={styles.hint}>
                {view.proxyEnabled ? t('proxyHint') : t('proxyOffHint')}
              </p>
            </label>

            {/* 测试连接 */}
            <div style={styles.field}>
              <span style={styles.label}>{t('testUrl')}</span>
              <input
                style={styles.input}
                value={testUrl}
                disabled={testing}
                onChange={(event) => setTestUrl(event.target.value)}
              />
              <button
                style={styles.button}
                disabled={disabled || testing}
                onClick={() => void runTest()}
              >
                {testing ? t('testing') : t('testRun')}
              </button>
              <p style={styles.warn}>{t('testQuotaWarn')}</p>
              {testResult !== null && (
                testResult.ok
                  ? (
                    <p style={styles.testOk}>
                      {t('testOk')} · {testResult.servedBy} · {testResult.durationMs}ms · {testResult.contentLength} chars
                    </p>
                  )
                  : (
                    <p style={styles.testFail}>
                      {t('testFail')}：{testResult.error ?? `HTTP ${testResult.statusCode}`}
                    </p>
                  )
              )}
            </div>
          </div>

          {/* ── 第二级：接口地址 + 上限 + API Key + 兜底 ── */}
          <button style={styles.section} onClick={() => setL2Open(prev => !prev)} aria-expanded={l2Open}>
            <span style={styles.sectionLabel}>{t('level2')}</span>
            <span style={styles.chevron}>{l2Open ? '▾' : '▸'}</span>
          </button>
          {l2Open && (
            <div style={styles.sectionBody}>
              <label style={styles.field}>
                <span style={styles.label}>{t('baseUrl')}</span>
                <input
                  style={styles.input}
                  value={displayBaseURL}
                  disabled={disabled}
                  onChange={(event) => {
                    const value = event.target.value
                    if (isCustomPrimary) {
                      setView(prev => prev ? {
                        ...prev,
                        customProviders: prev.customProviders.map(provider =>
                          provider.name === view.adapter ? { ...provider, baseURL: value } : provider),
                      } : prev)
                    } else {
                      setView(prev => prev ? { ...prev, baseURL: value } : prev)
                    }
                  }}
                  onBlur={(event) => void saveBaseURL(event.target.value)}
                />
                <p style={styles.hint}>{isCustomPrimary ? t('customEndpointHint') : t('baseUrlHint')}</p>
              </label>

              <label style={styles.field}>
                <span style={styles.label}>{t('maxFetches')}</span>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  value={view.maxFetchesPerSession}
                  disabled={disabled}
                  onChange={(event) => setView(prev => prev ? { ...prev, maxFetchesPerSession: Number(event.target.value) } : prev)}
                  onBlur={(event) => void saveField('maxFetchesPerSession', Number(event.target.value))}
                />
                <p style={styles.hint}>{t('maxFetchesHint')}</p>
              </label>

              <label style={styles.field}>
                <span style={styles.label}>{t('cacheSection')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={view.cacheEnabled}
                      disabled={disabled}
                      onChange={(event) => void saveField('cacheEnabled', event.target.checked)}
                    />
                    {t('cacheEnable')}
                  </label>
                  <input
                    style={{ ...styles.input, width: 90 }}
                    type="number"
                    min={0}
                    value={view.cacheTtlSeconds}
                    disabled={disabled || !view.cacheEnabled}
                    onChange={(event) => setView(prev => prev ? { ...prev, cacheTtlSeconds: Number(event.target.value) } : prev)}
                    onBlur={(event) => void saveField('cacheTtlSeconds', Number(event.target.value))}
                  />
                  <span style={{ fontSize: 12, color: '#666' }}>{t('cacheSeconds')}</span>
                </div>
                <p style={styles.hint}>{t('cacheHint')}</p>
              </label>
              <label style={styles.field}>
                <span style={styles.label}>{t('apiKey')}</span>
                <input
                  style={styles.input}
                  type="password"
                  value={keyInput}
                  disabled={!view.apiKeyWritable || saving}
                  placeholder={view.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset')}
                  onChange={(event) => setKeyInput(event.target.value)}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={styles.button}
                    disabled={!view.apiKeyWritable || saving || keyInput.length === 0}
                    onClick={() => void saveKey(keyInput)}
                  >
                    {t('save')}
                  </button>
                  {view.apiKeyConfigured && (
                    <button
                      style={styles.buttonGhost}
                      disabled={!view.apiKeyWritable || saving}
                      onClick={() => void clearKey()}
                    >
                      {t('clear')}
                    </button>
                  )}
                </div>
                <p style={styles.hint}>
                  {t('keyRefHint')} {view.apiKeyEnv} · {t('apiKeyHint')}
                </p>
              </label>

              <label style={styles.field}>
                <span style={styles.label}>{t('fallbackProvider')}</span>
                <select
                  style={styles.input}
                  value={view.fallback}
                  disabled={disabled}
                  onChange={(event) => void saveField('fallback', event.target.value)}
                >
                  <option value="">{t('fallbackNone')}</option>
                  {providerOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <p style={styles.hint}>{t('fallbackSuffix')}</p>
              </label>
            </div>
          )}

          {/* ── 自定义服务商 ── */}
          <button style={styles.section} onClick={() => setCustomsOpen(prev => !prev)} aria-expanded={customsOpen}>
            <span style={styles.sectionLabel}>{t('customSection')}</span>
            <span style={styles.chevron}>{customsOpen ? '▾' : '▸'}</span>
          </button>
          {customsOpen && (
            <div style={styles.sectionBody}>
              <p style={styles.info}>{t('customConditions')}</p>

              {customs.map((entry, index) => (
                <div key={index} style={styles.row}>
                  <div style={styles.rowHeader}>
                    <span style={{ ...styles.label, width: 44 }}>{t('customName')}</span>
                    <input
                      style={{ ...styles.input, ...styles.inline }}
                      value={entry.name}
                      disabled={disabled}
                      onChange={(event) => updateCustom(index, { name: event.target.value })}
                    />
                    <button style={styles.buttonGhost} disabled={disabled} onClick={() => removeCustom(index)}>
                      {t('customDelete')}
                    </button>
                  </div>
                  <div style={styles.rowHeader}>
                    <span style={{ ...styles.label, width: 44 }}>{t('customType')}</span>
                    <select
                      style={{ ...styles.input, ...styles.inline }}
                      value={entry.adapter}
                      disabled={disabled}
                      onChange={(event) => updateCustom(index, { adapter: event.target.value })}
                    >
                      {CUSTOM_ADAPTER_OPTIONS.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.rowHeader}>
                    <span style={{ ...styles.label, width: 44 }}>{t('baseUrl')}</span>
                    <input
                      style={{ ...styles.input, ...styles.inline }}
                      value={entry.baseURL}
                      disabled={disabled}
                      placeholder="http://127.0.0.1:8787"
                      onChange={(event) => updateCustom(index, { baseURL: event.target.value })}
                    />
                  </div>
                  <div style={styles.rowHeader}>
                    <span style={{ ...styles.label, width: 44 }}>{t('customKeyRef')}</span>
                    <input
                      style={{ ...styles.input, ...styles.inline }}
                      value={entry.apiKeyEnv}
                      disabled={disabled}
                      placeholder="MY_N8N_KEY（留空=该适配器默认）"
                      onChange={(event) => updateCustom(index, { apiKeyEnv: event.target.value })}
                    />
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.buttonGhost} disabled={disabled} onClick={addCustom}>
                  {t('customAdd')}
                </button>
                <button style={styles.button} disabled={disabled} onClick={() => void saveCustoms()}>
                  {t('customSave')}
                </button>
              </div>
            </div>
          )}

          {message !== '' && <p style={styles.msg}>{message}</p>}
        </>
      )}
    </div>
  )
}
