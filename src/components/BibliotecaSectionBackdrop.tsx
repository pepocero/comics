import { type ReactNode, useEffect, useMemo } from 'react'

export type BibliotecaBackdropKey =
  | 'home'
  | 'sources'
  | 'favorites'
  | 'downloads'
  | 'continue'
  | 'settings'

/**
 * Ruta bajo `public/` por sección: nombre en `bibliotecas/` o ruta absoluta desde la raíz del sitio.
 */
const SECTION_BACKDROP_FILE: Record<BibliotecaBackdropKey, string> = {
  home: '/portadas/portada_generica.png',
  sources: 'comic (11).jpg',
  favorites: 'comic (13).jpg',
  downloads: 'comic (13).jpg',
  continue: 'comic (25).jpg',
  settings: 'comic (30).jpg',
}

function backdropUrlForKey(key: BibliotecaBackdropKey): string {
  const raw = SECTION_BACKDROP_FILE[key].trim()
  if (raw.startsWith('/')) return raw
  const name = raw.replace(/^\/+/, '')
  return `/bibliotecas/${encodeURI(name)}`
}

type Props = {
  backdropKey: BibliotecaBackdropKey
  children: ReactNode
  /** `fullscreen`: pantallas solo de ajustes (sin AppShell). `inset`: dentro de `app-shell-main`. */
  layout?: 'inset' | 'fullscreen'
}

export function BibliotecaSectionBackdrop({
  backdropKey,
  children,
  layout = 'inset',
}: Props) {
  const bgUrl = useMemo(() => backdropUrlForKey(backdropKey), [backdropKey])

  useEffect(() => {
    document.body.classList.add('app-shell-biblioteca-bg')
    return () => {
      document.body.classList.remove('app-shell-biblioteca-bg')
    }
  }, [])

  const className =
    layout === 'fullscreen'
      ? 'biblioteca-section-backdrop biblioteca-section-backdrop--fullscreen'
      : 'biblioteca-section-backdrop biblioteca-section-backdrop--inset'

  return (
    <div
      className={className}
      style={{ ['--biblioteca-bg-image' as string]: `url(${JSON.stringify(bgUrl)})` }}
    >
      {children}
    </div>
  )
}
