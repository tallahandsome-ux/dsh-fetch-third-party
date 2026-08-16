/**
 * Standalone tsdown config for dsh-fetch-third-party.
 *
 * Host half: lib/index.js — ESM; every @deepseek-ai/* specifier stays EXTERNAL
 * (explicit list; the package declares no installable deps) so the runtime
 * resolves the shared instances from the dsh installation's profile
 * node_modules fallback — shared classes (WebError etc.) keep identity.
 * Client half: lib/client.js — CJS closure-factory form loaded by the dsh
 * browser module loader (window.__ModuleLoader__.load), externals resolved
 * from the frozen module table (platform modules + the runtime exemption).
 */
import { defineConfig } from 'tsdown'

/** Host-side shared instances, resolved from the profile fallback at runtime. */
const HOST_EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-launch-environment',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-web',
  '@deepseek-ai/schemastery',
  // Runtime dependency (ProxyAgent for per-request proxying).
  'undici',
]

/** Specifiers the browser module table answers; everything else inlines. */
const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  // Documented runtime-store exemption (mirrors the official preset).
  '@deepseek-ai/dsh-client-runtime/client',
]

export default defineConfig([
  {
    name: 'dsh-fetch-third-party',
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: true,
    external: HOST_EXTERNALS,
  },
  {
    name: 'dsh-fetch-third-party/client',
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: CLIENT_EXTERNALS,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-fetch-third-party", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
