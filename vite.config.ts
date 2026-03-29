import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
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

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(__BUILD_ID__),
  },
  plugins: [
    react(),
    comicreadBuildMetaPlugin(pkg.version, __BUILD_ID__),
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
        ],
      },
    }),
  ],
})
