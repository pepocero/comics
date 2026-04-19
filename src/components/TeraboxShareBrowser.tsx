import { useCallback, useEffect, useMemo, useState } from 'react'
import { getConfiguredMegaSources } from '../config/megaSettings'
import { normalizeMegaFolderUrlForCompare } from '../lib/megaFavorites'
import {
  buildMegaFavoriteRecord,
  getMegaFavorites,
  removeMegaFavorite,
  upsertMegaFavorite,
  type MegaLibraryNavTarget,
} from '../lib/megaFavorites'
import { isMegaLibraryListableFile } from '../lib/megaLibraryListableFiles'
import { fetchTeraboxShareFiles, type TeraboxMappedFile } from '../lib/teraboxShareResolver'
import { teraboxFileCacheId } from '../lib/teraboxFileId'
import {
  deleteCachedComic,
  getCachedComic,
  listCachedComicMeta,
  putCachedComic,
  verifyCachedComicBytes,
} from '../lib/comicStorage'
import { loadViewerPagesFromMegaCache, type CachedComicMeta } from '../lib/megaCachedViewer'
import { decodeTextFileForDisplay } from '../lib/decodeTextFileForDisplay'
import { formatBytes } from '../lib/formatBytes'
import type { ViewerPage } from './ComicViewer'
import type { LocalComicOpenPayload } from './LocalComicOpenButton'
import { LocalComicOpenButton } from './LocalComicOpenButton'

type Props = {
  shareUrl: string
  onOpenSettings: () => void
  onChangeSource?: () => void
  onOpenComic: (title: string, pages: ViewerPage[], ctx: { megaCacheId: string }) => void
  onOpenLocalComic: (payload: LocalComicOpenPayload) => void
  libraryNavTarget?: MegaLibraryNavTarget | null
  onLibraryNavTargetConsumed?: () => void
  onFavoritesChanged?: () => void
}

function isArchiveFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.endsWith('.cbz') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.cbr') ||
    lower.endsWith('.rar')
  )
}

export function TeraboxShareBrowser({
  shareUrl,
  onOpenSettings,
  onChangeSource,
  onOpenComic,
  onOpenLocalComic,
  libraryNavTarget = null,
  onLibraryNavTargetConsumed,
  onFavoritesChanged,
}: Props) {
  const [rawFiles, setRawFiles] = useState<TeraboxMappedFile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cachedRows, setCachedRows] = useState<CachedComicMeta[]>([])
  const [cachedIdSet, setCachedIdSet] = useState<Set<string>>(() => new Set())
  const [downloadingName, setDownloadingName] = useState<string | null>(null)
  const [openingCacheId, setOpeningCacheId] = useState<string | null>(null)
  const [favBump, setFavBump] = useState(0)

  const sourceLabel = useMemo(() => {
    const src = getConfiguredMegaSources().find(
      (s) =>
        normalizeMegaFolderUrlForCompare(s.url) === normalizeMegaFolderUrlForCompare(shareUrl),
    )
    return src?.label ?? 'Fuente Terabox'
  }, [shareUrl])

  const visibleFiles = useMemo(
    () => rawFiles.filter((f) => isMegaLibraryListableFile(f.name)),
    [rawFiles],
  )

  const refreshCacheInfo = useCallback((): Promise<void> => {
    return listCachedComicMeta().then((rows) => {
      const sorted = [...rows].sort((a, b) => b.downloadedAt - a.downloadedAt)
      setCachedRows(sorted)
      setCachedIdSet(new Set(rows.map((r) => r.id)))
    })
  }, [])

  useEffect(() => {
    refreshCacheInfo()
  }, [refreshCacheInfo])

  const favoriteIdSet = useMemo(
    () => new Set(getMegaFavorites().map((f) => f.fileId)),
    [favBump],
  )

  const loadList = useCallback(async (isRefresh: boolean): Promise<void> => {
    setLoadError(null)
    setToast(null)
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const list = await fetchTeraboxShareFiles(shareUrl)
      setRawFiles(list)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLoadError(msg || 'No se pudo cargar el recurso compartido.')
      setRawFiles([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [shareUrl])

  useEffect(() => {
    void loadList(false)
  }, [loadList])

  const openComicFromCache = useCallback(
    async (cacheId: string) => {
      let meta: CachedComicMeta | undefined = cachedRows.find((r) => r.id === cacheId)
      if (!meta) {
        const rows = await listCachedComicMeta()
        meta = rows.find((r) => r.id === cacheId)
      }
      if (!meta) {
        setToast('No se encontró el archivo en el dispositivo.')
        void refreshCacheInfo()
        return
      }
      const lower = meta.name.toLowerCase()
      const isPdf = lower.endsWith('.pdf')
      const isTxt = lower.endsWith('.txt')
      if (isPdf || isTxt) {
        setOpeningCacheId(cacheId)
        setToast(null)
        try {
          const cached = await getCachedComic(cacheId)
          if (!cached?.data) {
            setToast('El archivo ya no está en el dispositivo.')
            void refreshCacheInfo()
            return
          }
          const blob = isPdf
            ? new Blob([cached.data], { type: 'application/pdf' })
            : new Blob([decodeTextFileForDisplay(cached.data)], {
                type: 'text/plain;charset=utf-8',
              })
          const url = URL.createObjectURL(blob)
          const w = window.open(url, '_blank', 'noopener,noreferrer')
          if (!w) {
            URL.revokeObjectURL(url)
            setToast('Permite ventanas emergentes para ver este archivo en una pestaña nueva.')
            return
          }
          window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          setToast(msg || 'Error al abrir el archivo.')
        } finally {
          setOpeningCacheId(null)
        }
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
        void refreshCacheInfo()
      } finally {
        setOpeningCacheId(null)
      }
    },
    [cachedRows, onOpenComic, refreshCacheInfo],
  )

  const downloadToCacheAndMaybeOpen = useCallback(
    async (file: TeraboxMappedFile, openAfter: boolean): Promise<void> => {
      const name = file.name || 'archivo'
      if (!isMegaLibraryListableFile(name)) {
        setToast('Este tipo de archivo no se puede abrir desde aquí.')
        return
      }
      const id = teraboxFileCacheId(shareUrl, name)
      if (cachedIdSet.has(id)) {
        if (openAfter) await openComicFromCache(id)
        else setToast('Este archivo ya está descargado en este dispositivo.')
        return
      }

      setDownloadingName(name)
      setToast(null)
      try {
        const res = await fetch(file.dlink, { credentials: 'omit', mode: 'cors' })
        if (!res.ok) {
          throw new Error(`Descarga HTTP ${res.status}`)
        }
        const buffer = await res.arrayBuffer()
        const byteLength = buffer.byteLength
        if (byteLength < 1) throw new Error('Archivo vacío.')

        await putCachedComic({
          id,
          megaNodeId: '',
          name,
          size: file.size ?? byteLength,
          downloadedAt: Date.now(),
          data: buffer,
        })

        const verified = await verifyCachedComicBytes(id, byteLength)
        if (!verified) {
          await deleteCachedComic(id).catch(() => {})
          throw new Error('No se pudo verificar el archivo guardado.')
        }

        await refreshCacheInfo()
        if (openAfter) {
          await openComicFromCache(id)
        } else {
          setToast('Descarga guardada. Pulsa «Abrir» para leer.')
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setToast(
          msg ||
            'No se pudo descargar (CORS o bloqueo del servidor). Prueba otra red o abre el enlace en el navegador.',
        )
      } finally {
        setDownloadingName(null)
      }
    },
    [cachedIdSet, openComicFromCache, refreshCacheInfo, shareUrl],
  )

  const openOrDownload = useCallback(
    async (file: TeraboxMappedFile): Promise<void> => {
      await downloadToCacheAndMaybeOpen(file, true)
    },
    [downloadToCacheAndMaybeOpen],
  )

  useEffect(() => {
    const target = libraryNavTarget
    if (!target || loading || loadError) return
    if (
      normalizeMegaFolderUrlForCompare(target.megaFolderUrl) !==
      normalizeMegaFolderUrlForCompare(shareUrl)
    ) {
      onLibraryNavTargetConsumed?.()
      return
    }
    const file = visibleFiles.find((f) => teraboxFileCacheId(shareUrl, f.name) === target.fileId)
    if (!file) {
      setToast('El archivo del favorito no aparece en este enlace.')
      onLibraryNavTargetConsumed?.()
      return
    }
    onLibraryNavTargetConsumed?.()
    if (target.openComic === true) {
      void openOrDownload(file)
    }
  }, [
    libraryNavTarget,
    loading,
    loadError,
    visibleFiles,
    shareUrl,
    onLibraryNavTargetConsumed,
    openOrDownload,
  ])

  const toggleFavorite = useCallback(
    (file: TeraboxMappedFile) => {
      const name = file.name || '(sin nombre)'
      if (!isArchiveFileName(name)) return
      const id = teraboxFileCacheId(shareUrl, name)
      if (favoriteIdSet.has(id)) {
        removeMegaFavorite(id)
      } else {
        upsertMegaFavorite(
          buildMegaFavoriteRecord({
            fileId: id,
            megaFolderUrl: shareUrl,
            name,
            size: file.size,
            pathLabels: [],
          }),
        )
      }
      setFavBump((k) => k + 1)
      onFavoritesChanged?.()
    },
    [favoriteIdSet, onFavoritesChanged, shareUrl],
  )

  const handleRefresh = useCallback(() => {
    void loadList(true)
  }, [loadList])

  if (loading) {
    return (
      <div className="panel mega-browser-panel">
        <p className="muted">Conectando con Terabox…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="panel mega-browser-panel">
        <p className="error-msg">{loadError}</p>
        <p className="lead muted">
          Terabox a veces exige verificación en el navegador. Puedes configurar{' '}
          <code>VITE_TERABOX_RESOLVER_URL</code> con un resolver propio o usar el proxy incluido en
          despliegue (<code>/api/terabox-proxy</code>).
        </p>
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
          <button type="button" onClick={() => void loadList(false)}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

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

      <div className="mega-library-head">
        <div className="mega-library-head-titles">
          <h1 className="mega-library-title">{sourceLabel}</h1>
        </div>
        <div className="folder-up-row">
          <button type="button" className="folder-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Actualizando…' : 'Actualizar lista'}
          </button>
          {onChangeSource ? (
            <button type="button" className="btn-secondary" onClick={onChangeSource}>
              Cambiar fuente
            </button>
          ) : null}
          <button type="button" onClick={onOpenSettings}>
            Ajustes
          </button>
        </div>
      </div>

      <p className="muted terabox-share-line">
        Enlace Terabox: <span className="terabox-share-url">{shareUrl}</span>
      </p>

      <ul className="file-list">
        {visibleFiles.map((f) => {
          const label = f.name || '(sin nombre)'
          const cacheId = teraboxFileCacheId(shareUrl, label)
          const isCached = cachedIdSet.has(cacheId)
          const isBusy = downloadingName === label
          const busyOpen = openingCacheId === cacheId
          const showFav = isArchiveFileName(label)
          const isFav = favoriteIdSet.has(cacheId)

          if (isCached) {
            return (
              <li key={cacheId}>
                <div className="file-row file file--cached file-row-cached file-row--with-fav">
                  <div className="file-row-cached-inner">
                    <div className="file-row-top">
                      <span className="file-icon">📄</span>
                      <span className="file-name">{label}</span>
                      {f.size != null ? <span className="file-size">{formatBytes(f.size)}</span> : null}
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
                  {showFav ? (
                    <button
                      type="button"
                      className="file-fav-btn"
                      disabled={!!downloadingName || !!openingCacheId}
                      onClick={() => toggleFavorite(f)}
                      aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                      aria-pressed={isFav}
                      title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    >
                      {isFav ? '★' : '☆'}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          }

          return (
            <li key={cacheId}>
              <div className="file-row file file-row--with-fav">
                <button
                  type="button"
                  className="file-row-download"
                  title="Descargar desde Terabox y abrir en el visor"
                  onClick={() => void openOrDownload(f)}
                  disabled={!!downloadingName || !!openingCacheId}
                >
                  <div className="file-row-top">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{label}</span>
                    {f.size != null ? <span className="file-size">{formatBytes(f.size)}</span> : null}
                    {isBusy ? <span className="file-busy">Descargando…</span> : null}
                  </div>
                </button>
                {showFav ? (
                  <button
                    type="button"
                    className="file-fav-btn"
                    disabled={!!downloadingName || !!openingCacheId}
                    onClick={() => toggleFavorite(f)}
                    aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    aria-pressed={isFav}
                    title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                  >
                    {isFav ? '★' : '☆'}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
