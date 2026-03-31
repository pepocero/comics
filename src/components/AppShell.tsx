import type { ReactNode } from 'react'
import { useState } from 'react'

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

  const closeDrawer = () => setDrawerOpen(false)

  const handleNav = (id: ShellNavId) => {
    if (id === 'library' && libraryDisabled) return
    onNavigate(id)
    closeDrawer()
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
      {onOpenSettings ? (
        <div className="app-shell-footer">
          <button type="button" className="app-shell-settings-btn" onClick={onOpenSettings}>
            Ajustes de MEGA
          </button>
        </div>
      ) : null}
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

      <main className="app-shell-main">{children}</main>
    </div>
  )
}
