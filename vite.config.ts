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

  /** Solo en Node (Vite): destino del proxy `/api/terabox-proxy` en desarrollo. `terabox.page` suele fallar con 502. */
  const envAll = loadEnv(mode, process.cwd(), '')
  const teraboxDevTarget = (envAll.TERABOX_DEV_PROXY_TARGET ?? 'https://terabox.page').replace(/\/$/, '')
  const rawTeraboxPath = envAll.TERABOX_DEV_PROXY_PATH ?? '/api/proxy'
  const teraboxDevPath = rawTeraboxPath.startsWith('/') ? rawTeraboxPath : `/${rawTeraboxPath}`

  return {
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    /** Resolver Terabox sin CORS en desarrollo (mismo path que CF Pages Function en prod). */
    proxy: {
      '/api/terabox-proxy': {
        target: teraboxDevTarget,
        changeOrigin: true,
        rewrite: () => teraboxDevPath,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(__BUILD_ID__),
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
          /** Descargas Terabox / dlinks: no cachear en SW */
          {
            urlPattern: /^https:\/\/[^/]+\.(terabox\.com|1024terabox\.com)\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  }
})
