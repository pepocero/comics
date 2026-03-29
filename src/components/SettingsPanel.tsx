import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { parseMegaFolderUrl } from '../lib/parseMegaFolderUrl'
import {
  getManualMegaFolderUrl,
  hasEnvMegaSources,
  setMegaFolderUrl,
} from '../config/megaSettings'
import {
  clearAllCachedComics,
  clearAllLocalReadingBlobs,
  deleteCachedComic,
  estimateCacheBytes,
  listCachedComicMeta,
} from '../lib/comicStorage'
import type { CachedComicMeta } from '../lib/megaCachedViewer'
import { clearAllReadingProgress, getReadingList, removeReadingProgress } from '../lib/readingProgress'
import { formatBytes } from '../lib/formatBytes'
import { applyTheme, getStoredTheme, type AppTheme } from '../lib/appTheme'
import { AppVersionFooter } from './AppVersionFooter'

type Props = {
  onSaved: () => void
  onCancel?: () => void
  /** Primera ejecución sin URL guardada (solo modo manual sin env): el enlace MEGA es obligatorio arriba */
  initialSetup?: boolean
}

function removeMegaProgressForCacheId(cacheId: string): void {
  const list = getReadingList()
  const p = list.find((x) => x.source === 'mega' && x.megaCacheId === cacheId)
  if (p) removeReadingProgress(p)
}

export function SettingsPanel({ onSaved, onCancel, initialSetup = false }: Props) {
  const fromEnv = hasEnvMegaSources()
  const [rows, setRows] = useState<CachedComicMeta[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [urlValue, setUrlValue] = useState(() => (fromEnv ? '' : getManualMegaFolderUrl()))
  const [urlError, setUrlError] = useState<string | null>(null)
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme())

  function handleThemeChange(next: AppTheme): void {
    setTheme(next)
    applyTheme(next)
  }

  const refreshList = useCallback(async () => {
    setLoadingList(true)
    try {
      const list = await listCachedComicMeta()
      setRows([...list].sort((a, b) => b.downloadedAt - a.downloadedAt))
      setSelected(new Set())
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const cacheBytes = estimateCacheBytes(rows)
  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggleOne(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(): void {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(rows.map((r) => r.id)))
  }

  async function handleDeleteSelected(): Promise<void> {
    if (selected.size === 0) {
      setToast('Marca al menos un archivo.')
      return
    }
    if (
      !window.confirm(
        `¿Eliminar ${selected.size} archivo(s) descargado(s) de este dispositivo? No se puede deshacer.`,
      )
    ) {
      return
    }
    setBusy(true)
    setToast(null)
    try {
      for (const id of selected) {
        await deleteCachedComic(id)
        removeMegaProgressForCacheId(id)
      }
      await refreshList()
      setToast('Archivos eliminados.')
      onSaved()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Error al eliminar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleClearEverything(): Promise<void> {
    if (
      !window.confirm(
        '¿Vaciar toda la caché? Se borrarán todos los cómics descargados desde MEGA, los archivos locales guardados para lectura y el progreso de lectura en este dispositivo.',
      )
    ) {
      return
    }
    setBusy(true)
    setToast(null)
    try {
      await clearAllCachedComics()
      await clearAllLocalReadingBlobs()
      clearAllReadingProgress()
      await refreshList()
      setToast('Caché vaciada por completo.')
      onSaved()
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Error al vaciar la caché.')
    } finally {
      setBusy(false)
    }
  }

  function handleUrlSubmit(e: FormEvent): void {
    e.preventDefault()
    const parsed = parseMegaFolderUrl(urlValue)
    if (!parsed.ok) {
      setUrlError(parsed.error)
      return
    }
    setUrlError(null)
    setMegaFolderUrl(parsed.url)
    onSaved()
  }

  function handleUrlClear(): void {
    setUrlValue('')
    setMegaFolderUrl('')
    setUrlError(null)
    onSaved()
  }

  const megaUrlSection =
    fromEnv ? null : (
      <section className="settings-subsection" aria-labelledby="mega-url-heading">
        <h2 id="mega-url-heading" className="settings-h2">
          Carpeta MEGA
        </h2>
        <p className="lead settings-sub-lead">
          {initialSetup ? (
            <>
              Pega el enlace completo de la carpeta (incluye la parte después <code>#</code>) para
              empezar.
            </>
          ) : (
            <>Puedes cambiar el enlace guardado en este dispositivo.</>
          )}
        </p>
        <form onSubmit={handleUrlSubmit}>
          <label htmlFor="mega-url">Enlace de carpeta MEGA</label>
          <textarea
            id="mega-url"
            className="mega-url-input"
            value={urlValue}
            onChange={(e) => {
              setUrlValue(e.target.value)
              setUrlError(null)
            }}
            placeholder="https://mega.nz/folder/…#…"
            rows={3}
            autoComplete="off"
            spellCheck={false}
          />
          {urlError ? <p className="error-msg">{urlError}</p> : null}
          <div className="btn-row">
            <button type="submit" disabled={busy}>
              Guardar enlace
            </button>
            {!initialSetup ? (
              <button type="button" className="btn-secondary" onClick={handleUrlClear} disabled={busy}>
                Borrar enlace guardado
              </button>
            ) : null}
          </div>
        </form>
      </section>
    )

  const cacheSection = (
    <section className="settings-subsection" aria-labelledby="cache-heading">
      <h2 id="cache-heading" className="settings-h2">
        Caché y descargas
      </h2>
      <p className="lead settings-sub-lead">
        Cómics guardados en IndexedDB desde <strong>Biblioteca MEGA</strong>. Quitar aquí libera
        espacio; el progreso de lectura asociado a cada archivo también se elimina al borrarlo.
      </p>
      <div className="settings-cache-head">
        <span className="cache-badge cache-badge--inline" title="Espacio estimado">
          Total: {loadingList ? '…' : formatBytes(cacheBytes)}
        </span>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void refreshList()}
          disabled={busy || loadingList}
        >
          Actualizar lista
        </button>
      </div>

      {toast ? (
        <p className="settings-toast" role="status">
          {toast}
        </p>
      ) : null}

      {loadingList ? (
        <p className="muted">Cargando lista…</p>
      ) : rows.length === 0 ? (
        <p className="muted settings-empty">No hay archivos descargados en este dispositivo.</p>
      ) : (
        <>
          <div className="settings-cache-toolbar">
            <label className="settings-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={busy}
              />{' '}
              Seleccionar todos ({rows.length})
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleDeleteSelected()}
              disabled={busy || selected.size === 0}
            >
              Eliminar seleccionados
            </button>
          </div>
          <ul className="settings-cache-list">
            {rows.map((row) => {
              const title = row.name.replace(/\.[^.]+$/, '') || row.name
              const isSel = selected.has(row.id)
              return (
                <li key={row.id} className="settings-cache-row">
                  <label className="settings-cache-label">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleOne(row.id)}
                      disabled={busy}
                    />
                    <span className="settings-cache-info">
                      <span className="settings-cache-name" title={row.name}>
                        {title}
                      </span>
                      <span className="settings-cache-meta">
                        {formatBytes(row.size)} ·{' '}
                        {new Date(row.downloadedAt).toLocaleString('es', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary settings-cache-one-btn"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`¿Eliminar «${row.name}» de este dispositivo?`)) return
                      setBusy(true)
                      setToast(null)
                      void (async () => {
                        try {
                          await deleteCachedComic(row.id)
                          removeMegaProgressForCacheId(row.id)
                          await refreshList()
                          setToast('Archivo eliminado.')
                          onSaved()
                        } catch (e) {
                          setToast(e instanceof Error ? e.message : 'Error al eliminar.')
                        } finally {
                          setBusy(false)
                        }
                      })()
                    }}
                  >
                    Quitar
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="settings-danger-zone">
        <button
          type="button"
          className="settings-danger-btn"
          disabled={busy}
          onClick={() => void handleClearEverything()}
        >
          Vaciar toda la caché (MEGA + archivos locales de lectura + progreso)
        </button>
      </div>
    </section>
  )

  return (
    <section className="panel settings-panel">
      {onCancel ? (
        <div className="settings-panel-back-row">
          <button type="button" className="btn-secondary settings-back-btn" onClick={onCancel} disabled={busy}>
            Volver
          </button>
        </div>
      ) : null}
      <h1 className="settings-panel-title">Ajustes</h1>

      <section className="settings-subsection" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="settings-h2">
          Apariencia
        </h2>
        <p className="lead settings-sub-lead">Modo de color de la interfaz (se guarda en este dispositivo).</p>
        <div className="settings-theme-row" role="group" aria-label="Modo de color">
          <button
            type="button"
            className={`settings-theme-btn${theme === 'dark' ? ' settings-theme-btn--active' : ''}`}
            onClick={() => handleThemeChange('dark')}
            aria-pressed={theme === 'dark'}
          >
            Oscuro
          </button>
          <button
            type="button"
            className={`settings-theme-btn${theme === 'light' ? ' settings-theme-btn--active' : ''}`}
            onClick={() => handleThemeChange('light')}
            aria-pressed={theme === 'light'}
          >
            Claro
          </button>
        </div>
      </section>

      {fromEnv ? (
        <p className="lead settings-env-hint">
          La cuenta MEGA se define en la configuración de la aplicación. Para usar otra carpeta, en{' '}
          <strong>Biblioteca MEGA</strong> abre el menú (<strong>☰</strong>) y{' '}
          <strong>Cambiar fuente</strong>.
        </p>
      ) : null}

      {!fromEnv ? megaUrlSection : null}

      {cacheSection}

      <p className="warn settings-warn">
        Las descargas usan datos y espacio. Los archivos se guardan en el almacenamiento del
        navegador (IndexedDB) en este dispositivo.
      </p>
      <AppVersionFooter />
    </section>
  )
}
