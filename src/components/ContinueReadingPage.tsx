import type { ReadingProgress } from '../lib/readingProgress'
import { readingProgressKey } from '../lib/readingProgress'

type Props = {
  items: ReadingProgress[]
  busyId: string | null
  onContinue: (p: ReadingProgress) => void | Promise<void>
  onForget: (p: ReadingProgress) => void
}

export function ContinueReadingPage({ items, busyId, onContinue, onForget }: Props) {
  return (
    <div className="continue-page panel">
      <h1 className="continue-page-title">Seguir leyendo</h1>
      <p className="lead">
        Aquí aparecen todos los cómics con progreso guardado. Puedes tener varios en paralelo y
        continuar el que quieras; cada uno recuerda la página donde lo dejaste.
      </p>
      {items.length === 0 ? (
        <p className="muted continue-page-empty">
          Aún no hay lecturas en curso. Abre un cómic desde <strong>Descargas</strong>, la{' '}
          <strong>Biblioteca MEGA</strong> o un archivo local: se añadirá automáticamente a esta lista.
        </p>
      ) : (
        <ul className="continue-page-list">
          {items.map((p) => {
            const k = readingProgressKey(p)
            const busy = busyId === k
            const pageLabel = p.pageIndex + 1
            const sourceLabel = p.source === 'mega' ? 'MEGA' : 'Dispositivo'
            return (
              <li key={k} className="continue-page-card">
                <div className="continue-page-card-text">
                  <strong className="continue-page-card-title">{p.title}</strong>
                  <span className="continue-page-card-meta">
                    Página {pageLabel} de {p.totalPages} · {sourceLabel} ·{' '}
                    {new Date(p.updatedAt).toLocaleString('es', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div className="continue-page-card-actions">
                  <button
                    type="button"
                    className="continue-reading-primary"
                    onClick={() => void onContinue(p)}
                    disabled={!!busyId}
                  >
                    {busy ? 'Abriendo…' : 'Continuar'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary continue-reading-forget"
                    onClick={() => onForget(p)}
                    disabled={!!busyId}
                  >
                    Olvidar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
