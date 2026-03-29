import { formatBytes } from '../lib/formatBytes'
import type { CachedComicMeta } from '../lib/megaCachedViewer'

type Props = {
  rows: CachedComicMeta[]
  cacheBytes: number
  onRefresh: () => void
  onOpen: (meta: CachedComicMeta) => void | Promise<void>
  openingId: string | null
  onRemove: (id: string, displayName: string) => void
}

export function DownloadsSection({
  rows,
  cacheBytes,
  onRefresh,
  onOpen,
  openingId,
  onRemove,
}: Props) {
  return (
    <div className="downloads-section panel">
      <h1 className="downloads-section-title">Descargas</h1>
      <p className="lead">
        Archivos guardados en este dispositivo desde MEGA. Puedes abrirlos aquí sin volver al
        explorador.
      </p>
      <div className="downloads-section-head">
        <span className="cache-badge cache-badge--inline" title="Espacio usado en caché">
          Caché: {formatBytes(cacheBytes)}
        </span>
        <button type="button" className="btn-secondary source-picker-refresh" onClick={onRefresh}>
          Actualizar
        </button>
      </div>
      <div className="downloads-panel downloads-panel--standalone">
        {rows.length === 0 ? (
          <p className="muted downloads-empty">
            No hay descargas todavía. En <strong>Biblioteca MEGA</strong> elige un cómic para
            guardarlo; luego aparecerá aquí.
          </p>
        ) : (
          <ul className="downloads-list">
            {rows.map((row) => {
              const busy = openingId === row.id
              const title = row.name.replace(/\.[^.]+$/, '') || row.name
              return (
                <li key={row.id} className="downloads-row">
                  <div className="downloads-row-info">
                    <span className="downloads-row-name" title={row.name}>
                      {title}
                    </span>
                    <span className="downloads-row-meta">
                      {formatBytes(row.size)} ·{' '}
                      {new Date(row.downloadedAt).toLocaleString('es', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <div className="downloads-row-actions">
                    <button
                      type="button"
                      className="downloads-open-btn"
                      onClick={() => void onOpen(row)}
                      disabled={!!openingId}
                    >
                      {busy ? 'Abriendo…' : 'Abrir'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary downloads-remove-btn"
                      onClick={() => onRemove(row.id, row.name)}
                      disabled={!!openingId}
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
