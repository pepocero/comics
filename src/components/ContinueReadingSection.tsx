import { getReadingProgress } from '../lib/readingProgress'

type Props = {
  /** Ocultar mientras el visor está abierto */
  hidden?: boolean
  onContinue: () => void | Promise<void>
  onForget: () => void
  busy?: boolean
}

export function ContinueReadingSection({ hidden, onContinue, onForget, busy }: Props) {
  if (hidden) return null
  const p = getReadingProgress()
  if (!p) return null

  const pageLabel = p.pageIndex + 1
  const sourceLabel = p.source === 'mega' ? 'MEGA' : 'Dispositivo'

  return (
    <section className="continue-reading" aria-label="Seguir leyendo">
      <div className="continue-reading-inner">
        <div className="continue-reading-text">
          <strong className="continue-reading-title">Seguir leyendo</strong>
          <span className="continue-reading-meta">
            {p.title} · Página {pageLabel} de {p.totalPages} · {sourceLabel}
          </span>
        </div>
        <div className="continue-reading-actions">
          <button
            type="button"
            className="continue-reading-primary"
            onClick={() => void onContinue()}
            disabled={busy}
          >
            {busy ? 'Abriendo…' : 'Continuar'}
          </button>
          <button type="button" className="btn-secondary continue-reading-forget" onClick={onForget}>
            Olvidar
          </button>
        </div>
      </div>
    </section>
  )
}
