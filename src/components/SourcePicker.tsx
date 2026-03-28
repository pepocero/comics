import type { MegaSource } from '../config/megaSettings'
import { setStoredSourceSlot } from '../config/megaSettings'
import { formatBytes } from '../lib/formatBytes'
import type { CachedComicMeta } from '../lib/megaCachedViewer'
import { ContinueReadingSection } from './ContinueReadingSection'
import { LocalComicOpenButton, type LocalComicOpenPayload } from './LocalComicOpenButton'

type Props = {
  sources: MegaSource[]
  onSelect: () => void
  onOpenLocalComic: (payload: LocalComicOpenPayload) => void
  continueReadingHidden?: boolean
  onContinueReading: () => void | Promise<void>
  onForgetReading: () => void
  continueReadingBusy?: boolean
  /** Descargas en caché (misma lista que en el explorador MEGA) */
  downloadRows: CachedComicMeta[]
  cacheBytes: number
  onRefreshDownloads: () => void
  onOpenDownload: (meta: CachedComicMeta) => void | Promise<void>
  openingDownloadId: string | null
  onRemoveDownload: (id: string, displayName: string) => void
}

export function SourcePicker({
  sources,
  onSelect,
  onOpenLocalComic,
  continueReadingHidden,
  onContinueReading,
  onForgetReading,
  continueReadingBusy,
  downloadRows,
  cacheBytes,
  onRefreshDownloads,
  onOpenDownload,
  openingDownloadId,
  onRemoveDownload,
}: Props) {
  return (
    <section className="panel source-picker">
      <h1>ComicRead</h1>
      <p className="lead">
        Página de inicio: elige la cuenta de MEGA, abre cómics ya descargados en este dispositivo, o un
        archivo local.
      </p>
      <ContinueReadingSection
        hidden={continueReadingHidden}
        onContinue={onContinueReading}
        onForget={onForgetReading}
        busy={continueReadingBusy}
      />
      <ul className="source-list">
        {sources.map((s) => (
          <li key={s.slot}>
            <button
              type="button"
              className="source-card"
              onClick={() => {
                setStoredSourceSlot(s.slot)
                onSelect()
              }}
            >
              <span className="source-card-label">{s.label}</span>
              {s.hasCustomLabel ? null : (
                <span className="source-card-hint">Cuenta {s.slot + 1}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="source-picker-downloads-wrap">
        <div className="source-picker-downloads-head">
          <h2 className="source-picker-downloads-title">Descargas</h2>
          <span className="cache-badge cache-badge--inline" title="Espacio usado en caché">
            Caché: {formatBytes(cacheBytes)}
          </span>
          <button type="button" className="btn-secondary source-picker-refresh" onClick={onRefreshDownloads}>
            Actualizar
          </button>
        </div>
        <div className="downloads-panel downloads-panel--home">
          <p className="downloads-panel-hint muted">
            Archivos guardados desde MEGA. Puedes abrirlos aquí sin entrar al explorador.
          </p>
          {downloadRows.length === 0 ? (
            <p className="muted downloads-empty">
              No hay descargas todavía. Elige una cuenta arriba y descarga cómics desde el explorador; luego
              volverán a aparecer aquí.
            </p>
          ) : (
            <ul className="downloads-list">
              {downloadRows.map((row) => {
                const busy = openingDownloadId === row.id
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
                        onClick={() => void onOpenDownload(row)}
                        disabled={!!openingDownloadId}
                      >
                        {busy ? 'Abriendo…' : 'Abrir'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary downloads-remove-btn"
                        onClick={() => onRemoveDownload(row.id, row.name)}
                        disabled={!!openingDownloadId}
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

      <p className="source-picker-divider" role="presentation">
        o
      </p>
      <LocalComicOpenButton variant="panel" onOpen={onOpenLocalComic} />
    </section>
  )
}
