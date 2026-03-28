import { File as MegaFile } from 'megajs'
import { useCallback, useEffect, useState } from 'react'
import { parseMegaFolderUrl } from '../lib/parseMegaFolderUrl'
import { extractComicPages } from '../lib/comicArchive'
import { toArrayBuffer } from '../lib/bufferToArrayBuffer'
import {
  getCachedComic,
  putCachedComic,
  deleteCachedComic,
  clearAllCachedComics,
  listCachedComicMeta,
  estimateCacheBytes,
  verifyCachedComicBytes,
  type CachedComicRecord,
} from '../lib/comicStorage'
import { megaFileCacheId } from '../lib/megaFileId'
import type { ViewerPage } from './ComicViewer'
import { ContinueReadingSection } from './ContinueReadingSection'
import type { LocalComicOpenPayload } from './LocalComicOpenButton'
import { LocalComicOpenButton } from './LocalComicOpenButton'

type CachedMeta = Omit<CachedComicRecord, 'data'>

type MainTab = 'browse' | 'downloads'

type Props = {
  megaFolderUrl: string
  onOpenSettings: () => void
  /** Varias cuentas en env: volver al selector de fuente */
  onChangeSource?: () => void
  onOpenComic: (title: string, pages: ViewerPage[], ctx: { megaCacheId: string }) => void
  onOpenLocalComic: (payload: LocalComicOpenPayload) => void
  /** Seguir leyendo (visor cerrado) */
  continueReadingHidden?: boolean
  onContinueReading: () => void | Promise<void>
  onForgetReading: () => void
  continueReadingBusy?: boolean
}

function sortEntries(files: MegaFile[]): MegaFile[] {
  return [...files].sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1
    return (a.name || '').localeCompare(b.name || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Descarga con eventos `progress` de megajs.
 * `maxConnections: 1` usa un único fetch + ReadableStream en el navegador: evita casos donde
 * el modo multi-chunk no emite `end` y la promesa no se resuelve (p. ej. algunos entornos en producción).
 */
function downloadMegaFileToArrayBuffer(
  file: MegaFile,
  onProgress: (percent: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const stream = file.download({ maxConnections: 1 })
    const chunks: Uint8Array[] = []
    let settled = false
    let hangTimer: number | null = null

    const clearHangTimer = (): void => {
      if (hangTimer !== null) {
        clearTimeout(hangTimer)
        hangTimer = null
      }
    }

    const finish = (): void => {
      if (settled) return
      settled = true
      clearHangTimer()
      const totalLen = chunks.reduce((a, c) => a + c.length, 0)
      const merged = new Uint8Array(totalLen)
      let offset = 0
      for (const c of chunks) {
        merged.set(c, offset)
        offset += c.length
      }
      resolve(toArrayBuffer(merged))
    }

    const fail = (err: unknown): void => {
      if (settled) return
      settled = true
      clearHangTimer()
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    stream.on('progress', (data: { bytesLoaded: number; bytesTotal: number }) => {
      const total = Math.max(1, data.bytesTotal)
      const pct = Math.min(100, Math.round((data.bytesLoaded / total) * 100))
      onProgress(pct)
      if (pct >= 100) {
        clearHangTimer()
        hangTimer = window.setTimeout(() => {
          if (!settled) {
            fail(
              new Error(
                'La descarga no terminó correctamente tras el 100%. Prueba de nuevo o usa otro navegador.',
              ),
            )
          }
        }, 20000)
      }
    })
    stream.on('data', (chunk: Uint8Array | { length: number; [i: number]: number }) => {
      chunks.push(
        chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayLike<number>),
      )
    })
    stream.on('end', () => {
      finish()
    })
    stream.on('error', fail)
  })
}

export function MegaBrowser({
  megaFolderUrl,
  onOpenSettings,
  onChangeSource,
  onOpenComic,
  onOpenLocalComic,
  continueReadingHidden,
  onContinueReading,
  onForgetReading,
  continueReadingBusy,
}: Props) {
  const [navOpen, setNavOpen] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('browse')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingTree, setLoadingTree] = useState(true)
  const [downloadingName, setDownloadingName] = useState<string | null>(null)
  const [openingCacheId, setOpeningCacheId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [cacheBytes, setCacheBytes] = useState<number>(0)
  const [cachedRows, setCachedRows] = useState<CachedMeta[]>([])
  const [cachedIdSet, setCachedIdSet] = useState<Set<string>>(() => new Set())
  const [downloadProgress, setDownloadProgress] = useState<{
    name: string
    percent: number
  } | null>(null)

  const [root, setRoot] = useState<MegaFile | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<MegaFile[]>([])

  const current = breadcrumbs[breadcrumbs.length - 1] ?? null
  const entries = current?.directory
    ? sortEntries(current.children ?? [])
    : []

  const refreshCacheInfo = useCallback(() => {
    void listCachedComicMeta().then((rows) => {
      const sorted = [...rows].sort((a, b) => b.downloadedAt - a.downloadedAt)
      setCachedRows(sorted)
      setCacheBytes(estimateCacheBytes(rows))
      setCachedIdSet(new Set(rows.map((r) => r.id)))
    })
  }, [])

  useEffect(() => {
    refreshCacheInfo()
  }, [refreshCacheInfo])

  useEffect(() => {
    let cancelled = false
    const parsed = parseMegaFolderUrl(megaFolderUrl)
    if (!parsed.ok) {
      setLoadError(parsed.error)
      setLoadingTree(false)
      return
    }

    setLoadError(null)
    setLoadingTree(true)
    setRoot(null)
    setBreadcrumbs([])

    const file = MegaFile.fromURL(parsed.url)
    file
      .loadAttributes()
      .then((node) => {
        if (cancelled) return
        const r = node as MegaFile
        if (!r.directory) {
          setLoadError('El enlace no apunta a una carpeta.')
          setLoadingTree(false)
          return
        }
        setRoot(r)
        setBreadcrumbs([r])
        setLoadingTree(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setLoadError(msg || 'No se pudo cargar la carpeta de MEGA.')
        setLoadingTree(false)
      })

    return () => {
      cancelled = true
    }
  }, [megaFolderUrl])

  const enterFolder = useCallback((folder: MegaFile) => {
    setBreadcrumbs((prev) => [...prev, folder])
  }, [])

  const goUp = useCallback(() => {
    setBreadcrumbs((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }, [])

  /** Solo descarga y guarda en caché; verifica integridad; el visor se abre desde Descargas. */
  const downloadArchiveToCache = useCallback(
    async (file: MegaFile) => {
      const name = file.name || 'cómic'
      const lower = name.toLowerCase()
      const allowed =
        lower.endsWith('.cbz') ||
        lower.endsWith('.zip') ||
        lower.endsWith('.cbr') ||
        lower.endsWith('.rar')
      if (!allowed) {
        setToast('Solo se pueden descargar .cbz, .zip, .cbr o .rar.')
        return
      }

      const id = megaFileCacheId(file)
      if (cachedIdSet.has(id)) {
        setMainTab('downloads')
        setToast('Este archivo ya está en Descargas. Ábrelo desde la lista.')
        return
      }

      setDownloadingName(name)
      setToast(null)

      try {
        setDownloadProgress({ name, percent: 0 })
        const buffer = await downloadMegaFileToArrayBuffer(file, (percent) => {
          setDownloadProgress({ name, percent })
        })

        const byteLength = buffer.byteLength
        const size = file.size != null ? file.size : byteLength
        if (file.size != null && byteLength !== file.size) {
          throw new Error(
            `Tamaño incorrecto (esperado ${file.size} B, recibido ${byteLength} B).`,
          )
        }

        await putCachedComic({
          id,
          megaNodeId: file.nodeId ?? '',
          name,
          size,
          downloadedAt: Date.now(),
          data: buffer,
        })

        const verified = await verifyCachedComicBytes(id, byteLength)
        if (!verified) {
          await deleteCachedComic(id).catch(() => {})
          throw new Error('No se pudo verificar el archivo guardado. Inténtalo de nuevo.')
        }

        refreshCacheInfo()
        setToast('Descarga guardada correctamente. Ábrela en «Descargas».')
        setMainTab('downloads')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setToast(msg || 'Error al descargar el archivo.')
      } finally {
        setDownloadProgress(null)
        setDownloadingName(null)
      }
    },
    [cachedIdSet, refreshCacheInfo],
  )

  const openComicFromCache = useCallback(
    async (meta: CachedMeta) => {
      const id = meta.id
      const name = meta.name
      setOpeningCacheId(id)
      setToast(null)
      try {
        const cached = await getCachedComic(id)
        if (!cached?.data) {
          setToast('El archivo ya no está en el dispositivo.')
          refreshCacheInfo()
          return
        }
        const byteLen = cached.data.byteLength
        if (byteLen < 1) {
          setToast('El archivo en caché está vacío o dañado.')
          refreshCacheInfo()
          return
        }
        const metaSize = Number(meta.size)
        if (metaSize > 0 && byteLen !== metaSize) {
          console.warn('[ComicRead] Metadatos de tamaño distintos al buffer guardado', {
            metaSize,
            byteLen,
            id,
          })
        }

        const extracted = await extractComicPages(cached.data, name)
        const pages = extracted.map((p) => ({
          name: p.name,
          url: URL.createObjectURL(p.blob),
        }))
        onOpenComic(name, pages, { megaCacheId: id })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[ComicRead] Error al abrir desde caché', err)
        setToast(msg || 'Error al abrir el cómic.')
      } finally {
        setOpeningCacheId(null)
      }
    },
    [onOpenComic, refreshCacheInfo],
  )

  const removeCachedItem = useCallback(
    (id: string, displayName: string) => {
      if (!window.confirm(`¿Quitar «${displayName}» del dispositivo?`)) {
        return
      }
      void deleteCachedComic(id).then(() => {
        refreshCacheInfo()
        setToast('Archivo quitado de Descargas.')
      })
    },
    [refreshCacheInfo],
  )

  const handleClearCache = useCallback(() => {
    if (!window.confirm('¿Borrar todos los cómics en caché de este dispositivo?')) {
      return
    }
    void clearAllCachedComics().then(() => {
      refreshCacheInfo()
      setToast('Caché vaciada.')
    })
  }, [refreshCacheInfo])

  const closeNav = useCallback(() => setNavOpen(false), [])

  if (loadingTree) {
    return (
      <div className="panel">
        <ContinueReadingSection
          hidden={continueReadingHidden}
          onContinue={onContinueReading}
          onForget={onForgetReading}
          busy={continueReadingBusy}
        />
        <p className="muted">Conectando con MEGA…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="panel">
        <ContinueReadingSection
          hidden={continueReadingHidden}
          onContinue={onContinueReading}
          onForget={onForgetReading}
          busy={continueReadingBusy}
        />
        <p className="error-msg">{loadError}</p>
        <div className="btn-row">
          <LocalComicOpenButton variant="header" onOpen={onOpenLocalComic} />
          {onChangeSource ? (
            <button type="button" className="btn-secondary" onClick={onChangeSource}>
              Volver a elegir fuente
            </button>
          ) : null}
          <button type="button" onClick={onOpenSettings}>
            Ajustes
          </button>
        </div>
      </div>
    )
  }

  if (!root || !current) {
    return null
  }

  const pathLabel = breadcrumbs
    .map((f) => f.name || '…')
    .join(' / ')

  const navActions = (
    <>
      <span className="cache-badge" title="Espacio usado en caché">
        Caché: {formatBytes(cacheBytes)}
      </span>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          goUp()
          closeNav()
        }}
        disabled={breadcrumbs.length <= 1}
      >
        Subir
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          handleClearCache()
          closeNav()
        }}
      >
        Vaciar caché
      </button>
      <LocalComicOpenButton
        variant="header"
        onOpen={(p) => {
          closeNav()
          onOpenLocalComic(p)
        }}
        disabled={!!downloadingName || !!openingCacheId}
      />
      {onChangeSource ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            onChangeSource()
            closeNav()
          }}
        >
          Cambiar fuente
        </button>
      ) : null}
      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          onOpenSettings()
          closeNav()
        }}
      >
        Ajustes
      </button>
    </>
  )

  return (
    <div className="browser">
      <header className="browser-header">
        <div className="browser-path" title={pathLabel}>
          {pathLabel}
        </div>
        <div className="browser-actions browser-actions--desktop">{navActions}</div>
      </header>

      <button
        type="button"
        className="browser-burger-fab"
        onClick={() => setNavOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={navOpen}
      >
        ☰
      </button>

      {navOpen ? (
        <div
          className="browser-drawer-backdrop"
          role="presentation"
          onClick={closeNav}
        >
          <aside
            className="browser-drawer"
            role="dialog"
            aria-label="Menú"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="browser-drawer-head">
              <strong>Menú</strong>
              <button type="button" className="browser-drawer-close" onClick={closeNav} aria-label="Cerrar menú">
                ✕
              </button>
            </div>
            <div className="browser-drawer-actions">{navActions}</div>
          </aside>
        </div>
      ) : null}

      <ContinueReadingSection
        hidden={continueReadingHidden}
        onContinue={onContinueReading}
        onForget={onForgetReading}
        busy={continueReadingBusy}
      />

      <div className="browser-tabs" role="tablist" aria-label="Vista principal">
        <button
          type="button"
          role="tab"
          className={`browser-tab${mainTab === 'browse' ? ' browser-tab--active' : ''}`}
          aria-selected={mainTab === 'browse'}
          onClick={() => setMainTab('browse')}
        >
          Explorar
        </button>
        <button
          type="button"
          role="tab"
          className={`browser-tab${mainTab === 'downloads' ? ' browser-tab--active' : ''}`}
          aria-selected={mainTab === 'downloads'}
          onClick={() => setMainTab('downloads')}
        >
          Descargas
          {cachedRows.length > 0 ? (
            <span className="browser-tab-badge">{cachedRows.length}</span>
          ) : null}
        </button>
      </div>

      {toast ? (
        <div className="toast" role="status">
          {toast}
          <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ) : null}

      {mainTab === 'browse' ? (
        <>
          {breadcrumbs.length > 1 ? (
            <div className="folder-up-row">
              <button
                type="button"
                className="folder-up-btn"
                onClick={goUp}
                aria-label="Subir un nivel de carpeta"
                title="Subir un nivel"
              >
                ↑
              </button>
            </div>
          ) : null}

          <ul className="file-list">
            {entries.map((f) => {
              const label = f.name || '(sin nombre)'
              const isBusy = downloadingName === label
              if (f.directory) {
                return (
                  <li key={megaFileCacheId(f)}>
                    <button
                      type="button"
                      className="file-row folder"
                      onClick={() => enterFolder(f)}
                      disabled={!!downloadingName || !!openingCacheId}
                    >
                      <span className="file-icon">📁</span>
                      <span className="file-name">{label}</span>
                    </button>
                  </li>
                )
              }
              const cacheId = megaFileCacheId(f)
              const isCached = cachedIdSet.has(cacheId)
              const showProgress =
                isBusy && downloadProgress && downloadProgress.name === label
              return (
                <li key={cacheId}>
                  <button
                    type="button"
                    className={`file-row file${isCached ? ' file--cached' : ''}`}
                    title={
                      isCached
                        ? 'Ya guardado en Descargas — ábrelo desde la pestaña Descargas'
                        : 'Descargar a este dispositivo (luego ábrelo en Descargas)'
                    }
                    onClick={() => void downloadArchiveToCache(f)}
                    disabled={!!downloadingName || !!openingCacheId}
                  >
                    <div className="file-row-top">
                      <span className="file-icon">📄</span>
                      <span className="file-name">{label}</span>
                      {f.size != null ? (
                        <span className="file-size">{formatBytes(f.size)}</span>
                      ) : null}
                      {isBusy ? (
                        <span className="file-busy">Descargando…</span>
                      ) : isCached ? (
                        <span className="file-busy file-busy--ok">En Descargas</span>
                      ) : null}
                    </div>
                    {showProgress ? (
                      <div
                        className="file-download-row"
                        role="progressbar"
                        aria-valuenow={downloadProgress.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Descarga ${downloadProgress.percent} por ciento`}
                      >
                        <div className="file-download-track">
                          <div
                            className="file-download-fill"
                            style={{ width: `${downloadProgress.percent}%` }}
                          />
                        </div>
                        <span className="file-download-pct">{downloadProgress.percent}%</span>
                      </div>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          {entries.length === 0 ? (
            <p className="muted empty-folder">Carpeta vacía.</p>
          ) : null}
        </>
      ) : (
        <div className="downloads-panel">
          <p className="downloads-panel-hint muted">
            Los archivos descargados desde MEGA se guardan aquí. Verifica la descarga y ábrelos en el visor
            cuando quieras leer.
          </p>
          {cachedRows.length === 0 ? (
            <p className="muted downloads-empty">No hay descargas todavía. Explora una carpeta y pulsa un
            cómic para descargarlo.</p>
          ) : (
            <ul className="downloads-list">
              {cachedRows.map((row) => {
                const busy = openingCacheId === row.id
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
                        onClick={() => void openComicFromCache(row)}
                        disabled={!!downloadingName || !!openingCacheId}
                      >
                        {busy ? 'Abriendo…' : 'Abrir'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary downloads-remove-btn"
                        onClick={() => removeCachedItem(row.id, row.name)}
                        disabled={!!openingCacheId}
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
      )}
    </div>
  )
}
