import { File as MegaFile } from 'megajs'
import { useCallback, useEffect, useState } from 'react'
import { parseMegaFolderUrl } from '../lib/parseMegaFolderUrl'
import { toArrayBuffer } from '../lib/bufferToArrayBuffer'
import { formatBytes } from '../lib/formatBytes'
import { loadViewerPagesFromMegaCache, type CachedComicMeta } from '../lib/megaCachedViewer'
import {
  putCachedComic,
  deleteCachedComic,
  listCachedComicMeta,
  verifyCachedComicBytes,
} from '../lib/comicStorage'
import { megaFileCacheId } from '../lib/megaFileId'
import { isMegaSeparatorPlaceholderFolder } from '../lib/megaPlaceholderFolder'
import type { ViewerPage } from './ComicViewer'
import type { LocalComicOpenPayload } from './LocalComicOpenButton'
import { LocalComicOpenButton } from './LocalComicOpenButton'
import { MegaRootFolderCards } from './MegaRootFolderCards'

type Props = {
  megaFolderUrl: string
  onOpenSettings: () => void
  /** Varias cuentas en env: volver al selector de fuente */
  onChangeSource?: () => void
  onOpenComic: (title: string, pages: ViewerPage[], ctx: { megaCacheId: string }) => void
  onOpenLocalComic: (payload: LocalComicOpenPayload) => void
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
}: Props) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingTree, setLoadingTree] = useState(true)
  const [downloadingName, setDownloadingName] = useState<string | null>(null)
  const [openingCacheId, setOpeningCacheId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [cachedRows, setCachedRows] = useState<CachedComicMeta[]>([])
  const [cachedIdSet, setCachedIdSet] = useState<Set<string>>(() => new Set())
  const [downloadProgress, setDownloadProgress] = useState<{
    name: string
    percent: number
  } | null>(null)

  const [root, setRoot] = useState<MegaFile | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<MegaFile[]>([])

  const current = breadcrumbs[breadcrumbs.length - 1] ?? null
  const entriesRaw = current?.directory ? sortEntries(current.children ?? []) : []
  const entries = entriesRaw.filter(
    (f) => !(f.directory && isMegaSeparatorPlaceholderFolder(f.name)),
  )

  const refreshCacheInfo = useCallback(() => {
    void listCachedComicMeta().then((rows) => {
      const sorted = [...rows].sort((a, b) => b.downloadedAt - a.downloadedAt)
      setCachedRows(sorted)
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
          setLoadError('El enlace no es válido.')
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
        setLoadError(msg || 'No se pudo cargar el contenido.')
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

  /** Descarga y guarda en caché; el visor se abre desde Descargas en el menú lateral. */
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
        setToast('Este archivo ya está en Descargas. Ábrelo desde el menú «Descargas».')
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
        setToast('Descarga guardada. Ábrela en «Descargas» en el menú lateral.')
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
    async (cacheId: string) => {
      const meta = cachedRows.find((r) => r.id === cacheId)
      if (!meta) {
        setToast('No se encontró el archivo en el dispositivo. Actualiza la lista.')
        void refreshCacheInfo()
        return
      }
      setOpeningCacheId(cacheId)
      setToast(null)
      try {
        const payload = await loadViewerPagesFromMegaCache(meta)
        onOpenComic(payload.title, payload.pages, { megaCacheId: payload.megaCacheId })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setToast(msg || 'Error al abrir el cómic.')
        refreshCacheInfo()
      } finally {
        setOpeningCacheId(null)
      }
    },
    [cachedRows, onOpenComic, refreshCacheInfo],
  )

  if (loadingTree) {
    return (
      <div className="panel mega-browser-panel">
        <p className="muted">Conectando…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="panel mega-browser-panel">
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

  const atRoot = breadcrumbs.length === 1
  const folderEntries = entries.filter((f) => f.directory)
  const fileEntries = entries.filter((f) => !f.directory)

  return (
    <div className="browser">
      {toast ? (
        <div className="toast" role="status">
          {toast}
          <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ) : null}

      {atRoot && folderEntries.length > 0 ? (
        <MegaRootFolderCards
          folders={folderEntries}
          disabled={!!downloadingName || !!openingCacheId}
          onOpenFolder={enterFolder}
        />
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

      <ul className={`file-list${atRoot && folderEntries.length > 0 ? ' file-list--after-grid' : ''}`}>
        {(atRoot ? fileEntries : entries).map((f) => {
          const label = f.name || '(sin nombre)'
          const isBusy = downloadingName === label
          if (f.directory) {
            if (atRoot) return null
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
          const showProgress = isBusy && downloadProgress && downloadProgress.name === label
          const busyOpen = openingCacheId === cacheId

          if (isCached) {
            return (
              <li key={cacheId}>
                <div className="file-row file file--cached file-row-cached">
                  <div className="file-row-top">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{label}</span>
                    {f.size != null ? (
                      <span className="file-size">{formatBytes(f.size)}</span>
                    ) : null}
                    <span className="file-busy file-busy--ok">En el dispositivo</span>
                  </div>
                  <div className="file-row-cached-actions">
                    <button
                      type="button"
                      className="downloads-open-btn file-open-cached-btn"
                      onClick={() => void openComicFromCache(cacheId)}
                      disabled={!!downloadingName || !!openingCacheId}
                    >
                      {busyOpen ? 'Abriendo…' : 'Abrir'}
                    </button>
                  </div>
                </div>
              </li>
            )
          }

          return (
            <li key={cacheId}>
              <button
                type="button"
                className="file-row file"
                title="Descargar a este dispositivo (luego ábrelo aquí o en Descargas)"
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

      {(atRoot ? fileEntries : entries).length === 0 && !(atRoot && folderEntries.length > 0) ? (
        <p className="muted empty-folder">Carpeta vacía.</p>
      ) : null}
    </div>
  )
}
