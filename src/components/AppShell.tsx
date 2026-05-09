import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

export type ShellNavId = 'home' | 'sources' | 'library' | 'favorites' | 'downloads' | 'continue'

type NavItem = {
  id: ShellNavId
  label: string
  disabled?: boolean
}

type Props = {
  active: ShellNavId
  onNavigate: (id: ShellNavId) => void
  libraryDisabled?: boolean
  children: ReactNode
  /** Ocultar navegación detrás del visor a pantalla completa */
  navHidden?: boolean
  onOpenSettings?: () => void
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isAppAlreadyInstalled(): boolean {
  const standaloneByMedia = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standaloneByMedia || iosStandalone
}

const NAV: NavItem[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'sources', label: 'Fuentes' },
  { id: 'library', label: 'Biblioteca MEGA' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'downloads', label: 'Descargas' },
  { id: 'continue', label: 'Seguir leyendo' },
]

export function AppShell({
  active,
  onNavigate,
  libraryDisabled,
  children,
  navHidden,
  onOpenSettings,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [installStatus, setInstallStatus] = useState('')
  const [showInstalledModal, setShowInstalledModal] = useState(false)

  const closeDrawer = () => setDrawerOpen(false)

  const handleNav = (id: ShellNavId) => {
    if (id === 'library' && libraryDisabled) return
    onNavigate(id)
    closeDrawer()
  }

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault()
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent)
      setInstallStatus('')
    }

    const onAppInstalled = (): void => {
      setDeferredInstallPrompt(null)
      setInstallStatus('Aplicacion instalada correctamente.')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const handleInstallApp = async (): Promise<void> => {
    if (isAppAlreadyInstalled()) {
      setShowInstalledModal(true)
      return
    }

    if (!deferredInstallPrompt) {
      setInstallStatus('La instalacion guiada no esta disponible en este navegador.')
      return
    }
    await deferredInstallPrompt.prompt()
    const choice = await deferredInstallPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstallStatus('Instalando aplicacion en tu telefono...')
    } else {
      setInstallStatus('Instalacion cancelada. Puedes intentarlo de nuevo cuando quieras.')
    }
    setDeferredInstallPrompt(null)
  }

  const navBody = (
    <nav className="app-shell-nav" aria-label="Secciones principales">
      <div className="app-shell-brand">
        <span className="app-shell-logo" aria-hidden>
          CR
        </span>
        <div className="app-shell-brand-text">
          <strong>ComicRead</strong>
          <span>Lector desde MEGA</span>
        </div>
      </div>
      <ul className="app-shell-nav-list">
        {NAV.map((item) => {
          const disabled = item.id === 'library' && libraryDisabled
          const isActive = active === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`app-shell-nav-btn${isActive ? ' app-shell-nav-btn--active' : ''}${
                  disabled ? ' app-shell-nav-btn--disabled' : ''
                }`}
                onClick={() => handleNav(item.id)}
                disabled={disabled}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="app-shell-footer">
        {onOpenSettings ? (
          <button type="button" className="app-shell-settings-btn" onClick={onOpenSettings}>
            Ajustes de MEGA
          </button>
        ) : null}
        <button type="button" className="app-shell-install-btn" onClick={handleInstallApp}>
          Instalar app en tu telefono
        </button>
        {installStatus ? <p className="app-shell-install-status">{installStatus}</p> : null}
      </div>
    </nav>
  )

  if (navHidden) {
    return <div className="app-shell app-shell--plain">{children}</div>
  }

  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar app-shell-sidebar--desktop">{navBody}</aside>

      <div className="app-shell-mobile-bar">
        <button
          type="button"
          className="app-shell-burger"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú de navegación"
          aria-expanded={drawerOpen}
        >
          ☰
        </button>
        <span className="app-shell-mobile-title">ComicRead</span>
        <span className="app-shell-mobile-bar-spacer" aria-hidden="true" />
      </div>

      {drawerOpen ? (
        <div
          className="app-shell-drawer-backdrop"
          role="presentation"
          onClick={closeDrawer}
        >
          <aside
            className="app-shell-drawer"
            role="dialog"
            aria-label="Menú de navegación"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="app-shell-drawer-head">
              <strong>Menú</strong>
              <button
                type="button"
                className="app-shell-drawer-close"
                onClick={closeDrawer}
                aria-label="Cerrar menú"
              >
                ✕
              </button>
            </div>
            {navBody}
          </aside>
        </div>
      ) : null}

      {showInstalledModal ? (
        <div
          className="cr-modal-backdrop"
          role="presentation"
          onClick={() => setShowInstalledModal(false)}
        >
          <div
            className="cr-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Aplicación ya instalada"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="cr-modal-message">La app ya esta instalada en este dispositivo.</p>
            <div className="cr-modal-actions">
              <button
                type="button"
                className="app-shell-install-btn"
                onClick={() => setShowInstalledModal(false)}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="app-shell-main">{children}</main>
    </div>
  )
}
