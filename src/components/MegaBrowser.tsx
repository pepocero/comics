import { API as MegaApi, File as MegaFile } from 'megajs'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { parseMegaFolderUrl } from '../lib/parseMegaFolderUrl'
import { downloadMegaFileToArrayBuffer, megaBandwidthLimitAlertMessage } from '../lib/megaDownload'
import { formatBytes } from '../lib/formatBytes'
import { loadViewerPagesFromMegaCache, type CachedComicMeta } from '../lib/megaCachedViewer'
import {
  putCachedComic,
  deleteCachedComic,
  getCachedComic,
  listCachedComicMeta,
  verifyCachedComicBytes,
} from '../lib/comicStorage'
import {
  buildMegaFavoriteRecord,
  getMegaFavorites,
  normalizeMegaFolderUrlForCompare,
  removeMegaFavorite,
  upsertMegaFavorite,
  type MegaLibraryNavTarget,
} from '../lib/megaFavorites'
import { megaFileCacheId } from '../lib/megaFileId'
import { isMegaListHiddenFile } from '../lib/megaListHiddenFiles'
import { decodeTextFileForDisplay } from '../lib/decodeTextFileForDisplay'
import { isMegaLibraryListableFile } from '../lib/megaLibraryListableFiles'
import { isMegaSeparatorPlaceholderFolder } from '../lib/megaPlaceholderFolder'
import type { ViewerPage } from './ComicViewer'
import type { LocalComicOpenPayload } from './LocalComicOpenButton'
import { LocalComicOpenButton } from './LocalComicOpenButton'
import { MegaRootFolderCards } from './MegaRootFolderCards'
import { getConfiguredMegaSources } from '../config/megaSettings'

type Props = {
  megaFolderUrl: string
  onOpenSettings: () => void
  /** Varias cuentas en env: volver al selector de fuente */
  onChangeSource?: () => void
  onOpenComic: (title: string, pages: ViewerPage[], ctx: { megaCacheId: string }) => void
  onOpenLocalComic: (payload: LocalComicOpenPayload) => void
  /** Navegar a la carpeta de un favorito (se consume al aplicar o fallar). */
  libraryNavTarget?: MegaLibraryNavTarget | null
  onLibraryNavTargetConsumed?: () => void
  onFavoritesChanged?: () => void
}

type MegaLibraryWarmState = {
  root: MegaFile
  pathLabels: string[]
}

/** Cache en memoria por URL de fuente para evitar recarga completa al volver del visor. */
const MEGA_LIBRARY_WARM_CACHE = new Map<string, MegaLibraryWarmState>()

function sortEntries(files: MegaFile[]): MegaFile[] {
  return [...files].sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1
    return (a.name || '').localeCompare(b.name || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

function visibleSortedEntries(node: MegaFile): MegaFile[] {
  const entriesRaw = node.directory ? sortEntries(node.children ?? []) : []
  return entriesRaw.filter((f) => {
    if (f.directory && isMegaSeparatorPlaceholderFolder(f.name)) return false
    if (isMegaListHiddenFile(f.name)) return false
    if (!f.directory && !isMegaLibraryListableFile(f.name)) return false
    return true
  })
}

/** Coincidencia de búsqueda: `parentTrail` termina en la carpeta que contiene `file` (p. ej. [root, A, B] si file está en B). */
type SearchHit = {
  file: MegaFile
  parentTrail: MegaFile[]
}

type MegaLibrarySearchScope = 'all' | 'folders' | 'files'

function matchesSearchQuery(
  f: MegaFile,
  trailToFolder: MegaFile[],
  q: string,
): boolean {
  const label = (f.name || '').toLowerCase()
  const pathChain = [...trailToFolder.map((n) => (n.name || '').toLowerCase()), label].join('/')
  return label.includes(q) || pathChain.includes(q)
}

function shouldIncludeSearchHit(f: MegaFile, scope: MegaLibrarySearchScope): boolean {
  if (scope === 'all') return true
  if (scope === 'folders') return f.directory
  return !f.directory
}

function collectSearchHits(
  root: MegaFile,
  query: string,
  scope: MegaLibrarySearchScope,
): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const hits: SearchHit[] = []

  function walk(folder: MegaFile, trailToFolder: MegaFile[]): void {
    const entries = visibleSortedEntries(folder)
    for (const f of entries) {
      if (matchesSearchQuery(f, trailToFolder, q) && shouldIncludeSearchHit(f, scope)) {
        hits.push({ file: f, parentTrail: trailToFolder })
      }
      if (f.directory) {
        walk(f, [...trailToFolder, f])
      }
    }
  }

  walk(root, [root])

  hits.sort((a, b) => {
    const pa = [...a.parentTrail.slice(1).map((n) => n.name || ''), a.file.name || ''].join('/')
    const pb = [...b.parentTrail.slice(1).map((n) => n.name || ''), b.file.name || ''].join('/')
    return pa.localeCompare(pb, undefined, { numeric: true, sensitivity: 'base' })
  })

  return hits
}

function formatHitPath(hit: SearchHit): string {
  const parts = [...hit.parentTrail.slice(1).map((n) => n.name || ''), hit.file.name || ''].filter(
    Boolean,
  )
  return parts.join(' / ')
}

/**
 * Vuelve a enlazar la ruta desde `root` por nombre (mismos nodos que si navegaras carpeta a carpeta).
 * Tras «Abrir carpeta» desde la búsqueda, megajs puede comportarse mejor al descargar usando esta cadena.
 */
function resolveBreadcrumbsFromRoot(root: MegaFile, trail: MegaFile[]): MegaFile[] {
  if (trail.length === 0) return [root]
  let current = root
  const out: MegaFile[] = [root]
  for (let i = 1; i < trail.length; i++) {
    const wantName = trail[i].name || ''
    const kids = visibleSortedEntries(current).filter((f) => f.directory)
    const next = kids.find((f) => (f.name || '') === wantName)
    if (!next) return trail
    out.push(next)
    current = next
  }
  return out
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

/** Clave estable por fuente MEGA + cadena de carpetas (ids de nodo) para recordar scroll vertical. */
function megaBreadcrumbScrollKey(megaFolderUrl: string, crumbs: MegaFile[]): string {
  const u = megaFolderUrl.trim()
  const ids = crumbs.map((c) => megaFileCacheId(c)).join('/')
  return `${u}|${ids}`
}

function rootVisibleFolderNames(node: MegaFile): string[] {
  const kids = node.children ?? []
  return kids
    .filter((f) => f.directory && !isMegaSeparatorPlaceholderFolder(f.name))
    .map((f) => f.name || '(sin nombre)')
}

function resolveTrailByLabels(root: MegaFile, labels: string[]): MegaFile[] {
  const trail: MegaFile[] = [root]
  let cursor: MegaFile = root
  for (const label of labels) {
    const kids = visibleSortedEntries(cursor).filter((f) => f.directory)
    const next = kids.find((f) => (f.name || '') === label)
    if (!next) break
    trail.push(next)
    cursor = next
  }
  return trail
}

async function loadMegaRootFresh(megaFolderUrl: string): Promise<MegaFile> {
  // API nueva para evitar estado/cache en memoria de una sesión previa.
  const api = new MegaApi(false)
  const node = (await MegaFile.fromURL(megaFolderUrl, { api }).loadAttributes()) as MegaFile
  return node
}

function countRootDirs(node: MegaFile): number {
  if (!node.directory) return 0
  return (node.children ?? []).filter((c) => c.directory).length
}

function sumTreeBytes(node: MegaFile): number {
  if (!node.directory) {
    return typeof node.size === 'number' && Number.isFinite(node.size) && node.size > 0 ? node.size : 0
  }
  const kids = node.children ?? []
  let total = 0
  for (const kid of kids) {
    total += sumTreeBytes(kid)
  }
  return total
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * En algunos momentos MEGA puede devolver snapshots distintos entre llamadas cercanas.
 * Hacemos varias lecturas frescas y nos quedamos con la que reporta más carpetas en raíz.
 */
async function loadMegaRootFreshBestEffort(
  megaFolderUrl: string,
  attempts = 3,
): Promise<MegaFile> {
  let best: MegaFile | null = null
  let bestCount = -1
  let lastErr: unknown = null

  for (let i = 0; i < attempts; i++) {
    try {
      const n = await loadMegaRootFresh(megaFolderUrl)
      const c = countRootDirs(n)
      if (!best || c > bestCount) {
        best = n
        bestCount = c
      }
    } catch (e) {
      lastErr = e
    }
    if (i + 1 < attempts) {
      // breve pausa para evitar pegar al mismo edge-cache inmediatamente
      // eslint-disable-next-line no-await-in-loop -- intentos secuenciales deliberados
      await sleepMs(700)
    }
  }

  if (best) return best
  throw (lastErr instanceof Error ? lastErr : new Error(String(lastErr || 'No se pudo cargar MEGA.')))
}

export function MegaBrowser({
  megaFolderUrl,
  onOpenSettings,
  onChangeSource,
  onOpenComic,
  onOpenLocalComic,
  libraryNavTarget = null,
  onLibraryNavTargetConsumed,
  onFavoritesChanged,
}: Props) {
  const sourceCacheKey = useMemo(
    () => normalizeMegaFolderUrlForCompare(megaFolderUrl),
    [megaFolderUrl],
  )
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
  const [favBump, setFavBump] = useState(0)

  const [root, setRoot] = useState<MegaFile | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<MegaFile[]>([])
  const [librarySearchDraft, setLibrarySearchDraft] = useState('')
  const [librarySearchCommitted, setLibrarySearchCommitted] = useState('')
  const [librarySearchScope, setLibrarySearchScope] = useState<MegaLibrarySearchScope>('all')
  const [librarySearchVisible, setLibrarySearchVisible] = useState(false)
  /** Al bajar el scroll se pliega el bloque de búsqueda para ganar espacio al listado. */
  const [librarySearchBarCollapsed, setLibrarySearchBarCollapsed] = useState(false)
  const [refreshingTree, setRefreshingTree] = useState(false)
  const toastTimerRef = useRef<number | null>(null)
  const lastScrollYRef = useRef(0)
  const scrollDownAccumRef = useRef(0)
  const scrollUpAccumRef = useRef(0)
  const scrollYByBreadcrumbKeyRef = useRef<Map<string, number>>(new Map())
  const prevBreadcrumbDepthRef = useRef(0)
  const breadcrumbsRef = useRef<MegaFile[]>([])

  const current = breadcrumbs[breadcrumbs.length - 1] ?? null
  const entries = current?.directory ? visibleSortedEntries(current) : []
  const atRoot = breadcrumbs.length === 1

  useEffect(() => {
    breadcrumbsRef.current = breadcrumbs
  }, [breadcrumbs])

  useEffect(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    if (!toast) return
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 5000)
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
    }
  }, [toast])

  useEffect(() => {
    if (!root || loadingTree || loadError) return
    MEGA_LIBRARY_WARM_CACHE.set(sourceCacheKey, {
      root,
      pathLabels: breadcrumbs.slice(1).map((b) => b.name || ''),
    })
  }, [sourceCacheKey, root, breadcrumbs, loadingTree, loadError])

  const favoriteIdSet = useMemo(
    () => new Set(getMegaFavorites().map((f) => f.fileId)),
    [favBump],
  )
  const sourceLabel = useMemo(() => {
    const src = getConfiguredMegaSources().find(
      (s) =>
        normalizeMegaFolderUrlForCompare(s.url) === normalizeMegaFolderUrlForCompare(megaFolderUrl),
    )
    return src?.label ?? 'Fuente actual'
  }, [megaFolderUrl])
  const sourceTotalBytes = useMemo(() => (root ? sumTreeBytes(root) : 0), [root])

  const searchHits = useMemo(() => {
    if (!root || !librarySearchCommitted.trim()) return []
    return collectSearchHits(root, librarySearchCommitted.trim(), librarySearchScope)
  }, [root, librarySearchCommitted, librarySearchScope])

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

  const reloadTreeFromMega = useCallback(
    async (keepCurrentPath: boolean, showRefreshSummary = false) => {
      const parsed = parseMegaFolderUrl(megaFolderUrl)
      if (!parsed.ok) {
        setLoadError(parsed.error)
        setLoadingTree(false)
        return
      }

      const pathLabels = keepCurrentPath
        ? breadcrumbsRef.current.slice(1).map((b) => b.name || '')
        : []
      if (!keepCurrentPath) {
        setLoadError(null)
        setLoadingTree(true)
        scrollYByBreadcrumbKeyRef.current.clear()
        prevBreadcrumbDepthRef.current = 0
        setRoot(null)
        setBreadcrumbs([])
        setLibrarySearchDraft('')
        setLibrarySearchCommitted('')
        setLibrarySearchVisible(false)
        setLibrarySearchBarCollapsed(false)
      }
      setRefreshingTree(true)
      try {
        const fresh = await loadMegaRootFreshBestEffort(parsed.url, keepCurrentPath ? 2 : 4)
        if (!fresh.directory) {
          if (!keepCurrentPath) {
            setLoadError('El enlace no es válido.')
          } else {
            setToast('No se pudo actualizar la carpeta desde MEGA.')
          }
          return
        }

        const trail: MegaFile[] = [fresh]
        let cursor: MegaFile = fresh
        for (const label of pathLabels) {
          const kids = visibleSortedEntries(cursor).filter((f) => f.directory)
          const next = kids.find((f) => (f.name || '') === label)
          if (!next) break
          trail.push(next)
          cursor = next
        }

        setLoadError(null)
        setRoot(fresh)
        setBreadcrumbs(trail)
        if (showRefreshSummary) {
          const rawKids = fresh.children ?? []
          const rawDirCount = rawKids.filter((f) => f.directory).length
          const visibleDirCount = visibleSortedEntries(fresh).filter((f) => f.directory).length
          const hiddenByFilter = Math.max(0, rawDirCount - visibleDirCount)
          const visibleNames = rootVisibleFolderNames(fresh)
          console.info('[ComicRead][MEGA root refresh]', {
            rawDirCount,
            visibleDirCount,
            hiddenByFilter,
            visibleNames,
          })
          if (hiddenByFilter > 0) {
            setToast(
              `MEGA devolvió ${rawDirCount} carpeta(s) en raíz; se muestran ${visibleDirCount}. ${hiddenByFilter} ocultada(s) por filtros.`,
            )
          } else {
            setToast(
              `MEGA devolvió ${rawDirCount} carpeta(s) en raíz. Nombres: ${visibleNames.join(' | ')}`,
            )
          }
        } else if (keepCurrentPath) {
          setToast('Carpeta actualizada desde MEGA.')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!keepCurrentPath) {
          setLoadError(msg || 'No se pudo cargar el contenido.')
        } else {
          setToast(msg || 'No se pudo actualizar la carpeta desde MEGA.')
        }
      } finally {
        if (!keepCurrentPath) setLoadingTree(false)
        setRefreshingTree(false)
      }
    },
    [megaFolderUrl],
  )

  useEffect(() => {
    const warm = MEGA_LIBRARY_WARM_CACHE.get(sourceCacheKey)
    if (warm) {
      setLoadError(null)
      setRoot(warm.root)
      setBreadcrumbs(resolveTrailByLabels(warm.root, warm.pathLabels))
      setLoadingTree(false)
      // Refresco silencioso para no mostrar "Conectando..." al volver del visor.
      void reloadTreeFromMega(true)
      return
    }
    void reloadTreeFromMega(false)
  }, [sourceCacheKey, reloadTreeFromMega])

  useLayoutEffect(() => {
    if (!root || loadingTree || loadError) return
    const el = document.scrollingElement ?? document.documentElement
    const len = breadcrumbs.length
    const key = megaBreadcrumbScrollKey(megaFolderUrl, breadcrumbs)
    const saved = scrollYByBreadcrumbKeyRef.current.get(key)

    if (saved !== undefined) {
      el.scrollTop = saved
    } else if (len > prevBreadcrumbDepthRef.current) {
      el.scrollTop = 0
    }

    prevBreadcrumbDepthRef.current = len
  }, [breadcrumbs, megaFolderUrl, root, loadingTree, loadError])

  useEffect(() => {
    if (!root || loadingTree || loadError) return
    const scrollEl = document.scrollingElement ?? document.documentElement
    lastScrollYRef.current = scrollEl.scrollTop
    scrollDownAccumRef.current = 0
    scrollUpAccumRef.current = 0
    const collapseDistancePx = 36
    const expandDistancePx = 52

    const onScroll = (): void => {
      const y = scrollEl.scrollTop
      const dy = y - lastScrollYRef.current
      lastScrollYRef.current = y

      if (y < 24) {
        setLibrarySearchBarCollapsed(false)
        scrollDownAccumRef.current = 0
        scrollUpAccumRef.current = 0
        return
      }
      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
      const atBottom = y >= maxScroll - 2
      const nearBottom = maxScroll - y <= 96
      if (nearBottom) {
        // Evita oscilaciones en el borde inferior (efecto persiana).
        scrollDownAccumRef.current = 0
        scrollUpAccumRef.current = 0
        return
      }

      if (Math.abs(dy) < 0.5) return

      if (dy > 0) {
        scrollDownAccumRef.current += dy
        scrollUpAccumRef.current = 0
        if (!librarySearchBarCollapsed && scrollDownAccumRef.current >= collapseDistancePx) {
          setLibrarySearchBarCollapsed(true)
          scrollDownAccumRef.current = 0
        }
      } else {
        scrollUpAccumRef.current += -dy
        scrollDownAccumRef.current = 0
        if (
          librarySearchBarCollapsed &&
          !atBottom &&
          scrollUpAccumRef.current >= expandDistancePx
        ) {
          setLibrarySearchBarCollapsed(false)
          scrollUpAccumRef.current = 0
        }
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [root, loadingTree, loadError, librarySearchBarCollapsed])

  const enterFolder = useCallback(
    (folder: MegaFile) => {
      setBreadcrumbs((prev) => {
        const scrollEl = document.scrollingElement ?? document.documentElement
        const key = megaBreadcrumbScrollKey(megaFolderUrl, prev)
        scrollYByBreadcrumbKeyRef.current.set(key, scrollEl.scrollTop)
        return [...prev, folder]
      })
    },
    [megaFolderUrl],
  )

  const goUp = useCallback(() => {
    setBreadcrumbs((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }, [])

  useEffect(() => {
    const onLibraryBack = (event: Event): void => {
      const customEvent = event as CustomEvent<{ handled: boolean }>
      const trail = breadcrumbsRef.current
      if (trail.length <= 1) return
      setBreadcrumbs((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
      customEvent.detail.handled = true
    }
    window.addEventListener('comicread:library-back', onLibraryBack as EventListener)
    return () => {
      window.removeEventListener('comicread:library-back', onLibraryBack as EventListener)
    }
  }, [])

  const clearLibrarySearch = useCallback(() => {
    setLibrarySearchDraft('')
    setLibrarySearchCommitted('')
  }, [])

  const toggleLibrarySearchVisible = useCallback(() => {
    setLibrarySearchVisible((prev) => {
      const next = !prev
      if (!next) clearLibrarySearch()
      return next
    })
  }, [clearLibrarySearch])

  /** Incluye la ✕ nativa de `type="search"`: al vaciar el cuadro se quita también la búsqueda aplicada. */
  const onLibrarySearchDraftChange = useCallback((value: string) => {
    setLibrarySearchDraft(value)
    if (value.trim() === '') {
      setLibrarySearchCommitted('')
    }
  }, [])

  const submitLibrarySearch = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setLibrarySearchCommitted(librarySearchDraft.trim())
    },
    [librarySearchDraft],
  )

  const navigateToSearchHit = useCallback(
    (hit: SearchHit, clearQuery = true) => {
      if (!root) return
      flushSync(() => {
        if (hit.file.directory) {
          setBreadcrumbs(resolveBreadcrumbsFromRoot(root, [...hit.parentTrail, hit.file]))
        } else {
          setBreadcrumbs(resolveBreadcrumbsFromRoot(root, hit.parentTrail))
        }
      })
      const el = document.scrollingElement ?? document.documentElement
      el.scrollTop = 0
      if (clearQuery) clearLibrarySearch()
    },
    [root, clearLibrarySearch],
  )

  const toggleMegaFavorite = useCallback(
    (file: MegaFile, pathLabelsOverride?: string[]) => {
      const name = file.name || '(sin nombre)'
      if (!isArchiveFileName(name)) return
      const id = megaFileCacheId(file)
      const pathLabels =
        pathLabelsOverride ?? breadcrumbs.slice(1).map((n) => n.name || '')
      if (favoriteIdSet.has(id)) {
        removeMegaFavorite(id)
      } else {
        upsertMegaFavorite(
          buildMegaFavoriteRecord({
            fileId: id,
            megaFolderUrl,
            name,
            size: file.size ?? null,
            pathLabels,
          }),
        )
      }
      setFavBump((k) => k + 1)
      onFavoritesChanged?.()
    },
    [breadcrumbs, favoriteIdSet, megaFolderUrl, onFavoritesChanged],
  )

  const openComicFromCache = useCallback(
    async (cacheId: string) => {
      let meta: CachedComicMeta | undefined = cachedRows.find((r) => r.id === cacheId)
      if (!meta) {
        const rows = await listCachedComicMeta()
        meta = rows.find((r) => r.id === cacheId)
      }
      if (!meta) {
        setToast('No se encontró el archivo en el dispositivo. Actualiza la lista.')
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
        refreshCacheInfo()
      } finally {
        setOpeningCacheId(null)
      }
    },
    [cachedRows, onOpenComic, refreshCacheInfo],
  )

  /** Descarga y guarda en caché; con `openInViewer` abre al terminar (p. ej. favoritos). */
  const downloadArchiveToCache = useCallback(
    async (file: MegaFile, options?: { openInViewer?: boolean }) => {
      const name = file.name || 'cómic'
      const allowed = isMegaLibraryListableFile(name)
      if (!allowed) {
        setToast('Este tipo de archivo no se puede descargar desde aquí.')
        return
      }

      const id = megaFileCacheId(file)
      if (cachedIdSet.has(id)) {
        if (options?.openInViewer) {
          await openComicFromCache(id)
        } else {
          setToast('Este archivo ya está en Descargas. Ábrelo desde el menú «Descargas».')
        }
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

        await refreshCacheInfo()
        if (options?.openInViewer) {
          await openComicFromCache(id)
          setToast(null)
        } else {
          setToast('Descarga guardada. Ábrela en «Descargas» en el menú lateral.')
        }
      } catch (err: unknown) {
        const quotaAlert = megaBandwidthLimitAlertMessage(err)
        if (quotaAlert) {
          setToast(quotaAlert)
          return
        }
        const msg = err instanceof Error ? err.message : String(err)
        setToast(msg || 'Error al descargar el archivo.')
      } finally {
        setDownloadProgress(null)
        setDownloadingName(null)
      }
    },
    [cachedIdSet, openComicFromCache, refreshCacheInfo],
  )

  useEffect(() => {
    if (!root || loadingTree || loadError) return
    const target = libraryNavTarget
    if (!target) return
    if (
      normalizeMegaFolderUrlForCompare(target.megaFolderUrl) !==
      normalizeMegaFolderUrlForCompare(megaFolderUrl)
    ) {
      onLibraryNavTargetConsumed?.()
      return
    }

    let trail: MegaFile[] = [root]
    let folder: MegaFile = root
    for (const label of target.pathLabels) {
      const kids = visibleSortedEntries(folder).filter((f) => f.directory)
      const next = kids.find((f) => (f.name || '') === label)
      if (!next) {
        setToast('No se encontró la carpeta del favorito. Puede haber cambiado en MEGA.')
        onLibraryNavTargetConsumed?.()
        return
      }
      trail.push(next)
      folder = next
    }
    setBreadcrumbs(trail)
    const navScrollEl = document.scrollingElement ?? document.documentElement
    navScrollEl.scrollTop = 0

    const filesHere = visibleSortedEntries(folder).filter((f) => !f.directory)
    const file = filesHere.find((f) => megaFileCacheId(f) === target.fileId)
    if (!file) {
      setToast('El archivo del favorito no aparece en esta carpeta.')
      onLibraryNavTargetConsumed?.()
      return
    }

    onLibraryNavTargetConsumed?.()

    if (target.openComic === true) {
      const id = target.fileId
      if (cachedIdSet.has(id)) {
        void openComicFromCache(id)
      } else {
        void downloadArchiveToCache(file, { openInViewer: true })
      }
    }
  }, [
    root,
    loadingTree,
    loadError,
    libraryNavTarget,
    megaFolderUrl,
    onLibraryNavTargetConsumed,
    cachedIdSet,
    openComicFromCache,
    downloadArchiveToCache,
  ])

  if (loadingTree) {
    return (
      <div
        className="panel mega-browser-panel mega-browser-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="mega-browser-loading-card">
          <div className="mega-browser-loading-bar" aria-hidden="true">
            <div className="mega-browser-loading-bar-track">
              <div className="mega-browser-loading-bar-indeterminate" />
            </div>
          </div>
          <div className="mega-browser-loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="mega-browser-loading-title">Conectando con MEGA</p>
          <p className="mega-browser-loading-sub">Obteniendo la carpeta compartida…</p>
        </div>
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

  const folderEntries = entries.filter((f) => f.directory)
  const fileEntries = entries.filter((f) => !f.directory)
  const searchActive = librarySearchCommitted.trim().length > 0

  return (
    <div className="browser">
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      <div className="mega-library-head">
        <div className="mega-library-head-titles">
          <h1 className="mega-library-title">{sourceLabel}</h1>
          {sourceTotalBytes > 0 ? (
            <p className="mega-library-subtitle">Tamaño total: {formatBytes(sourceTotalBytes)}</p>
          ) : null}
        </div>
        <button type="button" className="mega-library-search-toggle" onClick={toggleLibrarySearchVisible}>
          {librarySearchVisible ? 'Ocultar buscador' : 'Buscar'}
        </button>
      </div>

      {librarySearchVisible ? (
        <div
          className={`mega-library-search-wrap${librarySearchBarCollapsed ? ' mega-library-search-wrap--collapsed' : ''}`}
          onFocusCapture={() => setLibrarySearchBarCollapsed(false)}
        >
          <div className="mega-library-search" role="search">
            <form className="mega-library-search-form" onSubmit={submitLibrarySearch}>
              <label className="mega-library-search-label-block" htmlFor="mega-library-search-input">
                Buscar en toda la biblioteca
                <div className="mega-library-search-input-row">
                  <input
                    id="mega-library-search-input"
                    type="search"
                    value={librarySearchDraft}
                    onChange={(e) => onLibrarySearchDraftChange(e.target.value)}
                    placeholder="Nombre de carpeta o archivo (p. ej. Spiderman)…"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={
                      searchActive
                        ? 'mega-library-search-hint mega-library-search-scope-legend'
                        : 'mega-library-search-scope-legend'
                    }
                  />
                  <button type="submit" className="mega-library-search-submit">
                    Buscar
                  </button>
                </div>
              </label>
              <fieldset className="mega-library-search-scope">
                <legend id="mega-library-search-scope-legend" className="mega-library-search-scope-legend">
                  Buscar en
                </legend>
                <div
                  className="mega-library-search-scope-options"
                  role="radiogroup"
                  aria-label="Tipo de resultado"
                >
                  {(
                    [
                      { value: 'all' as const, label: 'Todo' },
                      { value: 'folders' as const, label: 'Carpetas' },
                      { value: 'files' as const, label: 'Archivos' },
                    ] as const
                  ).map(({ value, label }) => (
                    <label key={value} className="mega-library-search-scope-option">
                      <input
                        type="radio"
                        name="mega-library-search-scope"
                        value={value}
                        checked={librarySearchScope === value}
                        onChange={() => setLibrarySearchScope(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </form>
            {searchActive ? (
              <p id="mega-library-search-hint" className="mega-library-search-meta">
                {`${searchHits.length} resultado${searchHits.length === 1 ? '' : 's'} · «${librarySearchCommitted.trim()}» · ${
                  librarySearchScope === 'folders'
                    ? 'solo carpetas'
                    : librarySearchScope === 'files'
                      ? 'solo archivos'
                      : 'carpetas y archivos'
                }`}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!searchActive && breadcrumbs.length > 1 ? (
        <div className="folder-up-row folder-up-row--with-up">
          <button
            type="button"
            className="folder-up-btn"
            onClick={goUp}
            disabled={refreshingTree}
            aria-label="Subir un nivel de carpeta"
            title="Subir un nivel"
          >
            ↑
          </button>
          <button
            type="button"
            className="folder-refresh-btn"
            onClick={() => void reloadTreeFromMega(true, true)}
            disabled={refreshingTree}
            aria-label="Actualizar carpeta actual desde MEGA"
            title="Actualizar carpeta"
          >
            {refreshingTree ? 'Actualizando…' : 'Actualizar carpeta'}
          </button>
        </div>
      ) : !searchActive ? (
        <div className="folder-up-row">
          <button
            type="button"
            className="folder-refresh-btn"
            onClick={() => void reloadTreeFromMega(false, true)}
            disabled={refreshingTree}
            aria-label="Actualizar fuente MEGA desde raíz"
            title="Actualizar carpeta"
          >
            {refreshingTree ? 'Actualizando…' : 'Actualizar carpeta'}
          </button>
        </div>
      ) : null}

      {!searchActive && atRoot && folderEntries.length > 0 ? (
        <MegaRootFolderCards
          megaFolderUrl={megaFolderUrl}
          folders={folderEntries}
          disabled={!!downloadingName || !!openingCacheId}
          onOpenFolder={enterFolder}
        />
      ) : null}

      {searchActive ? (
        <ul className="file-list mega-library-search-results" aria-label="Resultados de búsqueda">
          {searchHits.length === 0 ? (
            <li>
              <p className="muted">Ninguna coincidencia. Prueba con otras palabras o revisa la ortografía.</p>
            </li>
          ) : (
            searchHits.map((hit) => {
              const f = hit.file
              const label = f.name || '(sin nombre)'
              const pathLine = formatHitPath(hit)
              if (f.directory) {
                return (
                  <li key={`dir-${megaFileCacheId(f)}`}>
                    <div className="mega-search-hit">
                      <div className="mega-search-hit-path">{pathLine}</div>
                      <div className="mega-search-hit-name">📁 {label}</div>
                      <div className="mega-search-hit-actions">
                        <button
                          type="button"
                          onClick={() => navigateToSearchHit(hit)}
                          disabled={!!downloadingName || !!openingCacheId}
                        >
                          Abrir carpeta
                        </button>
                      </div>
                    </div>
                  </li>
                )
              }
              const cacheId = megaFileCacheId(f)
              const isCached = cachedIdSet.has(cacheId)
              const isBusy = downloadingName === label
              const showProgress = isBusy && downloadProgress && downloadProgress.name === label
              const busyOpen = openingCacheId === cacheId
              const showFav = isArchiveFileName(label)
              const pathLabelsForFav = hit.parentTrail.slice(1).map((n) => n.name || '')
              const isFav = favoriteIdSet.has(cacheId)

              return (
                <li key={cacheId}>
                  <div className="mega-search-hit">
                    <div className="mega-search-hit-path">{pathLine}</div>
                    <div className="mega-search-hit-name">📄 {label}</div>
                    <div className="mega-search-hit-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => navigateToSearchHit(hit)}
                        disabled={!!downloadingName || !!openingCacheId}
                      >
                        Ver en carpeta
                      </button>
                      {isCached ? (
                        <button
                          type="button"
                          onClick={() => void openComicFromCache(cacheId)}
                          disabled={!!downloadingName || !!openingCacheId}
                        >
                          {busyOpen ? 'Abriendo…' : 'Abrir'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void downloadArchiveToCache(f)}
                          disabled={!!downloadingName || !!openingCacheId}
                        >
                          {isBusy ? 'Descargando…' : 'Descargar'}
                        </button>
                      )}
                      {showFav ? (
                        <button
                          type="button"
                          className="file-fav-btn"
                          disabled={!!downloadingName || !!openingCacheId}
                          onClick={() => toggleMegaFavorite(f, pathLabelsForFav)}
                          aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                          aria-pressed={isFav}
                          title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                        >
                          {isFav ? '★' : '☆'}
                        </button>
                      ) : null}
                    </div>
                    {showProgress && downloadProgress ? (
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
                  </div>
                </li>
              )
            })
          )}
        </ul>
      ) : null}

      {!searchActive ? (
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

          const showFav = isArchiveFileName(label)

          if (isCached) {
            const isFavCached = favoriteIdSet.has(cacheId)
            return (
              <li key={cacheId}>
                <div className="file-row file file--cached file-row-cached file-row--with-fav">
                  <div className="file-row-cached-inner">
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
                  {showFav ? (
                    <button
                      type="button"
                      className="file-fav-btn"
                      disabled={!!downloadingName || !!openingCacheId}
                      onClick={() => toggleMegaFavorite(f)}
                      aria-label={isFavCached ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                      aria-pressed={isFavCached}
                      title={
                        isFavCached
                          ? 'Quitar de favoritos'
                          : 'Guardar en favoritos (también si ya está descargado)'
                      }
                    >
                      {isFavCached ? '★' : '☆'}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          }

          const isFav = favoriteIdSet.has(cacheId)

          return (
            <li key={cacheId}>
              <div className="file-row file file-row--with-fav">
                <button
                  type="button"
                  className="file-row-download"
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
                {showFav ? (
                  <button
                    type="button"
                    className="file-fav-btn"
                    disabled={!!downloadingName || !!openingCacheId}
                    onClick={() => toggleMegaFavorite(f)}
                    aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    aria-pressed={isFav}
                    title={isFav ? 'Quitar de favoritos' : 'Guardar para descargar después'}
                  >
                    {isFav ? '★' : '☆'}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      ) : null}

      {!searchActive &&
      (atRoot ? fileEntries : entries).length === 0 &&
      !(atRoot && folderEntries.length > 0) ? (
        <p className="muted empty-folder">Carpeta vacía.</p>
      ) : null}
    </div>
  )
}
