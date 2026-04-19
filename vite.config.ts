import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkgPath = fileURLToPath(new URL('./package.json', import.meta.url))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }

/** Cloudflare Pages inyecta el SHA en build: https://developers.cloudflare.com/pages/configuration/build-configuration/ */
function buildId(): string {
  const cf = process.env.CF_PAGES_COMMIT_SHA
  if (cf) return cf.slice(0, 12)
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID
  return `local-${Date.now()}`
}

const __BUILD_ID__ = buildId()

/**
 * Emite `build-meta.json` en cada `vite build` con contenido único (`builtAt`).
 * Workbox lo precachea (ver `globPatterns` con `json`) para que el `sw.js` cambie en cada
 * despliegue y la PWA pueda detectar actualización tras `git push` + CI.
 */
function comicreadBuildMetaPlugin(version: string, buildId: string): Plugin {
  return {
    name: 'comicread-build-meta',
    generateBundle() {
      const source = JSON.stringify(
        {
          version,
          buildId,
          builtAt: new Date().toISOString(),
        },
        null,
        0,
      )
      this.emitFile({
        type: 'asset',
        fileName: 'build-meta.json',
        source,
      })
    },
  }
}

/**
 * Lee en build `VITE_MEGA_FOLDER_URL_<n>` y `VITE_MEGA_SOURCE_LABEL_<n>` (n ≥ 1, sin límite práctico).
 * Si no hay ninguna numerada, usa `VITE_MEGA_FOLDER_URL` como fuente única (equivale a n=1).
 */
function comicreadMegaSourcesFromViteEnv(env: Record<string, string>): { n: number; url: string; label: string }[] {
  const urlByN = new Map<number, string>()
  const labelByN = new Map<number, string>()
  for (const [key, val] of Object.entries(env)) {
    const um = key.match(/^VITE_MEGA_FOLDER_URL_(\d+)$/)
    if (um) {
      const n = parseInt(um[1], 10)
      if (n >= 1 && n <= 999) urlByN.set(n, String(val ?? '').trim())
    }
    const lm = key.match(/^VITE_MEGA_SOURCE_LABEL_(\d+)$/)
    if (lm) {
      const n = parseInt(lm[1], 10)
      if (n >= 1 && n <= 999) labelByN.set(n, String(val ?? '').trim())
    }
  }
  const ns = [...urlByN.keys()].sort((a, b) => a - b)
  const rows: { n: number; url: string; label: string }[] = []
  for (const n of ns) {
    const url = urlByN.get(n) ?? ''
    if (!url) continue
    rows.push({ n, url, label: labelByN.get(n) ?? '' })
  }
  const legacy = (env.VITE_MEGA_FOLDER_URL ?? '').trim()
  if (rows.length === 0 && legacy) {
    rows.push({ n: 1, url: legacy, label: '' })
  }
  return rows
}

/** URL absoluta de og:image para redes (WhatsApp exige https + dominio). Ver `VITE_SITE_ORIGIN` en `.env.example`. */
function comicreadOgMetaPlugin(siteOrigin: string): Plugin {
  const imagePath = '/portadas/portada_generica.png'
  const ogImage = siteOrigin ? `${siteOrigin}${imagePath}` : imagePath
  const ogUrl = siteOrigin ? `${siteOrigin}/` : '/'
  return {
    name: 'comicread-og-meta',
    transformIndexHtml(html) {
      return html
        .replaceAll('__COMICREAD_OG_IMAGE__', ogImage)
        .replaceAll('__COMICREAD_OG_URL__', ogUrl)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /** Solo prefijo VITE_: `''` hace que se mezcle todo `process.env` y no aporta al plugin OG. */
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const siteOrigin = (env.VITE_SITE_ORIGIN ?? '').replace(/\/$/, '')
  const megaSources = comicreadMegaSourcesFromViteEnv(env as Record<string, string>)

  return {
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(__BUILD_ID__),
    __COMICREAD_MEGA_SOURCES__: JSON.stringify(megaSources),
  },
  plugins: [
    react(),
    comicreadBuildMetaPlugin(pkg.version, __BUILD_ID__),
    comicreadOgMetaPlugin(siteOrigin),
    VitePWA({
      /** `prompt` + `PwaUpdateGate` aplican la actualización en cuanto hay nueva versión desplegada */
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],
      manifest: {
        name: 'ComicRead',
        short_name: 'ComicRead',
        description: 'Lector de cómics CBZ desde carpetas MEGA',
        theme_color: '#12121a',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'es',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        /** Incluye `json` para `build-meta.json` (nuevo contenido cada build → nuevo precache → nuevo SW). */
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2,wasm,json}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(mega\.nz|g\.mega\.co\.nz)\/.*/i,
            handler: 'NetworkOnly',
          },
          /** CDN de ficheros (p. ej. userstorage.mega.co.nz); sin esto el SW puede interceptar mal y fallar la descarga */
          {
            urlPattern: /^https:\/\/[a-z0-9.-]+\.mega\.co\.nz\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  }
})
