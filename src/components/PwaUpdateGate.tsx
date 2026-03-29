import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** En móvil los navegadores limitan comprobaciones en segundo plano; intervalo más corto ayuda tras un push. */
const UPDATE_CHECK_MS = 2 * 60 * 1000

function requestSwUpdate(registration: ServiceWorkerRegistration | null): void {
  if (!registration) return
  void registration.update().catch(() => {
    /* offline u host bloqueando: se reintenta al volver la app */
  })
}

/**
 * Comprueba si hay un nuevo service worker (nuevo despliegue en Cloudflare) y fuerza la
 * instalación: mensaje `skipWaiting` y recarga al tomar el control (vite-plugin-pwa / workbox-window).
 *
 * En PWA móvil conviene llamar a `registration.update()` al volver a primer plano, al recuperar red
 * y con intervalo periódico; además `pageshow` cubre caché de retroceso (bfcache).
 */
export function PwaUpdateGate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [applying, setApplying] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      setRegistration(reg ?? null)
    },
  })

  useEffect(() => {
    if (!registration) return
    const check = (): void => {
      requestSwUpdate(registration)
    }
    check()
    const interval = window.setInterval(check, UPDATE_CHECK_MS)
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        window.setTimeout(check, 0)
      }
    }
    const onPageShow = (): void => {
      window.setTimeout(check, 0)
    }
    const onOnline = (): void => {
      check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', check)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', onOnline)
    }
  }, [registration])

  useEffect(() => {
    if (!needRefresh) return
    setApplying(true)
    const t = window.setTimeout(() => {
      void updateServiceWorker()
    }, 400)
    return () => clearTimeout(t)
  }, [needRefresh, updateServiceWorker])

  if (!applying) return null

  return (
    <div className="pwa-update-overlay" role="status" aria-live="polite">
      <div className="pwa-update-card">
        <p className="pwa-update-title">Actualización disponible</p>
        <p className="pwa-update-text">Instalando la nueva versión…</p>
      </div>
    </div>
  )
}
