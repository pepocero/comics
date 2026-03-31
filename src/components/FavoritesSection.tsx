import { formatBytes } from '../lib/formatBytes'
import type { MegaFavoriteRecord, MegaLibraryNavTarget } from '../lib/megaFavorites'

type Props = {
  items: MegaFavoriteRecord[]
  currentMegaFolderUrl: string
  libraryReady: boolean
  onGoToLibrary: (target: MegaLibraryNavTarget) => void
  onRemove: (fileId: string, displayName: string) => void
}

export function FavoritesSection({
  items,
  currentMegaFolderUrl,
  libraryReady,
  onGoToLibrary,
  onRemove,
}: Props) {
  const sorted = [...items].sort((a, b) => b.addedAt - a.addedAt)

  return (
    <div className="downloads-section panel favorites-section">
      <h1 className="downloads-section-title">Favoritos</h1>
      <p className="lead">
        Cómics de MEGA que quieres descargar más adelante. Desde la{' '}
        <strong>Biblioteca MEGA</strong>, pulsa la estrella en un archivo para añadirlo o quitarlo.
      </p>
      <div className="downloads-panel downloads-panel--standalone">
        {sorted.length === 0 ? (
          <p className="muted downloads-empty">
            Aún no hay favoritos. En <strong>Biblioteca MEGA</strong>, en cada archivo .cbz / .zip /
            .cbr / .rar verás un botón para guardarlo en esta lista.
          </p>
        ) : (
          <ul className="downloads-list">
            {sorted.map((row) => {
              const title = row.name.replace(/\.[^.]+$/, '') || row.name
              const sourceOk = row.megaFolderUrl === currentMegaFolderUrl
              const canGo = libraryReady && sourceOk
              return (
                <li key={row.fileId} className="downloads-row">
                  <div className="downloads-row-info">
                    <span className="downloads-row-name" title={row.name}>
                      {title}
                    </span>
                    <span className="downloads-row-meta">
                      {row.size != null ? `${formatBytes(row.size)} · ` : null}
                      {new Date(row.addedAt).toLocaleString('es', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                      {!sourceOk ? (
                        <span className="favorites-wrong-source"> · otra fuente</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="downloads-row-actions">
                    <button
                      type="button"
                      className="downloads-open-btn"
                      onClick={() =>
                        onGoToLibrary({
                          megaFolderUrl: row.megaFolderUrl,
                          pathLabels: row.pathLabels,
                          fileId: row.fileId,
                        })
                      }
                      disabled={!canGo}
                      title={
                        !libraryReady
                          ? 'Elige una fuente en «Fuentes» primero'
                          : !sourceOk
                            ? 'Cambia a la fuente de este favorito en «Fuentes»'
                            : 'Abrir la carpeta en la biblioteca'
                      }
                    >
                      Ir a biblioteca
                    </button>
                    <button
                      type="button"
                      className="btn-secondary downloads-remove-btn"
                      onClick={() => onRemove(row.fileId, row.name)}
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
