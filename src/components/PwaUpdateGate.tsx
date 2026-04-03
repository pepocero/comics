import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** En móvil los navegadores limitan comprobaciones en segundo plano; intervalo más corto ayuda tras un push. */
const UPDATE_CHECK_MS = 2 * 60 * 1000

/** Si Workbox no dispara recarga (p. ej. PWA iOS), forzamos recarga tras este margen. */
const FORCE_RELOAD_MS = 14_000

/** Mostrar botón manual antes del auto-reload (por si el usuario no quiere esperar). */
const SHOW_MANUAL_RELOAD_MS = 6000

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
 * Respaldo: en móvil el evento `controlling` de Workbox a veces no recarga la página; entonces
 * `controllerchange` en `navigator.serviceWorker` y un timeout llaman a `location.reload()`.
 */
export function PwaUpdateGate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [applying, setApplying] = useState(false)
  const [showManualReload, setShowManualReload] = useState(false)

  const awaitingReloadRef = useRef(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      setRegistration(reg ?? null)
    },
  })

  /** Mismo criterio que Workbox `controlling`+reload, pero a nivel del SW del documento (más fiable en móvil). */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onControllerChange = (): void => {
      if (!awaitingReloadRef.current) return
      awaitingReloadRef.current = false
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

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
    if (!needRefresh) {
      setApplying(false)
      setShowManualReload(false)
      awaitingReloadRef.current = false
      return
    }

    setApplying(true)
    setShowManualReload(false)

    const startT = window.setTimeout(() => {
      awaitingReloadRef.current = true
      void updateServiceWorker()
    }, 400)

    const manualT = window.setTimeout(() => {
      setShowManualReload(true)
    }, SHOW_MANUAL_RELOAD_MS)

    const forceT = window.setTimeout(() => {
      awaitingReloadRef.current = false
      window.location.reload()
    }, FORCE_RELOAD_MS)

    return () => {
      window.clearTimeout(startT)
      window.clearTimeout(manualT)
      window.clearTimeout(forceT)
    }
  }, [needRefresh, updateServiceWorker, setNeedRefresh])

  const onManualReload = (): void => {
    awaitingReloadRef.current = false
    setApplying(false)
    setNeedRefresh(false)
    window.location.reload()
  }

  if (!applying) return null

  return (
    <div className="pwa-update-overlay" role="status" aria-live="polite">
      <div className="pwa-update-card">
        <p className="pwa-update-title">Actualización disponible</p>
        <p className="pwa-update-text">
          {showManualReload
            ? 'La recarga automática puede tardar en tu dispositivo. Puedes recargar tú ahora o esperar.'
            : 'Instalando la nueva versión…'}
        </p>
        {showManualReload ? (
          <button type="button" className="pwa-update-reload-btn" onClick={onManualReload}>
            Recargar ahora
          </button>
        ) : null}
      </div>
    </div>
  )
}
