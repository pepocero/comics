import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_MS = 5 * 60 * 1000

/**
 * Comprueba si hay un nuevo service worker (nuevo despliegue en Cloudflare) y fuerza la
 * instalación: mensaje `skipWaiting` y recarga al tomar el control (vite-plugin-pwa / workbox-window).
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
      void registration.update()
    }
    const interval = window.setInterval(check, UPDATE_CHECK_MS)
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', check)
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
