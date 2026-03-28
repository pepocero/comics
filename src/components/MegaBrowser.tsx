import { File as MegaFile } from 'megajs'
import { useCallback, useEffect, useState } from 'react'
import { parseMegaFolderUrl } from '../lib/parseMegaFolderUrl'
import { extractComicPages } from '../lib/comicArchive'
import { toArrayBuffer } from '../lib/bufferToArrayBuffer'
import {
  getCachedComic,
  putCachedComic,
  clearAllCachedComics,
  listCachedComicMeta,
  estimateCacheBytes,
} from '../lib/comicStorage'
import { megaFileCacheId } from '../lib/megaFileId'
import type { ViewerPage } from './ComicViewer'
import { ContinueReadingSection } from './ContinueReadingSection'
import type { LocalComicOpenPayload } from './LocalComicOpenButton'
import { LocalComicOpenButton } from './LocalComicOpenButton'

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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingTree, setLoadingTree] = useState(true)
  const [opening, setOpening] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [cacheBytes, setCacheBytes] = useState<number>(0)
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

  const openArchive = useCallback(
    async (file: MegaFile) => {
      const name = file.name || 'cómic'
      const lower = name.toLowerCase()
      const allowed =
        lower.endsWith('.cbz') ||
        lower.endsWith('.zip') ||
        lower.endsWith('.cbr') ||
        lower.endsWith('.rar')
      if (!allowed) {
        setToast('Solo se pueden abrir .cbz, .zip, .cbr o .rar con imágenes.')
        return
      }

      const id = megaFileCacheId(file)
      setOpening(name)
      setToast(null)

      try {
        let buffer: ArrayBuffer
        const cached = await getCachedComic(id)
        const fromCache = !!cached?.data
        if (cached?.data) {
          buffer = cached.data
        } else {
          setDownloadProgress({ name, percent: 0 })
          buffer = await downloadMegaFileToArrayBuffer(file, (percent) => {
            setDownloadProgress({ name, percent })
          })
        }

        const extracted = await extractComicPages(buffer, name)
        const pages = extracted.map((p) => ({
          name: p.name,
          url: URL.createObjectURL(p.blob),
        }))
        onOpenComic(name, pages, { megaCacheId: id })

        if (!fromCache) {
          const size = file.size ?? buffer.byteLength
          void putCachedComic({
            id,
            megaNodeId: file.nodeId ?? '',
            name,
            size,
            downloadedAt: Date.now(),
            data: buffer,
          })
            .then(() => {
              setCachedIdSet((prev) => {
                const next = new Set(prev)
                next.add(id)
                return next
              })
              refreshCacheInfo()
            })
            .catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e)
              setToast(`No se pudo guardar en caché (${msg}). El cómic ya está abierto.`)
            })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setToast(msg || 'Error al abrir el archivo.')
      } finally {
        setDownloadProgress(null)
        setOpening(null)
      }
    },
    [onOpenComic, refreshCacheInfo],
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
        disabled={!!opening}
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

      {toast ? (
        <div className="toast" role="status">
          {toast}
          <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ) : null}

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
          const isBusy = opening === label
          if (f.directory) {
            return (
              <li key={megaFileCacheId(f)}>
                <button
                  type="button"
                  className="file-row folder"
                  onClick={() => enterFolder(f)}
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
                    ? 'En caché: se abre sin volver a descargar desde MEGA'
                    : undefined
                }
                onClick={() => void openArchive(f)}
                disabled={!!opening}
              >
                <div className="file-row-top">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{label}</span>
                  {f.size != null ? (
                    <span className="file-size">{formatBytes(f.size)}</span>
                  ) : null}
                  {isBusy ? <span className="file-busy">Descargando…</span> : null}
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
    </div>
  )
}
