import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearMegaLibraryEntered,
  getConfiguredMegaSources,
  getMegaFolderUrl,
  hasEnvMegaSources,
  needsSourceSelection,
  setMegaFolderUrl,
  setMegaLibraryEntered,
  setStoredSourceSlot,
  setUseManualMegaUrl,
} from './config/megaSettings'
import { BibliotecaSectionBackdrop } from './components/BibliotecaSectionBackdrop'
import { AppShell, type ShellNavId } from './components/AppShell'
import { ContinueReadingPage } from './components/ContinueReadingPage'
import { DownloadsSection } from './components/DownloadsSection'
import { HomePage } from './components/HomePage'
import { SettingsPanel } from './components/SettingsPanel'
import { SourcePicker } from './components/SourcePicker'
import { FavoritesSection } from './components/FavoritesSection'
import { MegaBrowser } from './components/MegaBrowser'
import { ComicViewer, type ViewerPage } from './components/ComicViewer'
import type { LocalComicOpenPayload } from './components/LocalComicOpenButton'
import { PwaUpdateGate } from './components/PwaUpdateGate'
import type { ViewerSession } from './lib/readingProgress'
import {
  buildProgressFromViewer,
  getReadingList,
  loadViewerFromProgress,
  readingProgressKey,
  removePreviousLocalBlobIfAny,
  persistLocalArchiveForReading,
  removeReadingProgress,
  upsertReadingProgress,
} from './lib/readingProgress'
import type { ReadingProgress } from './lib/readingProgress'
import {
  getMegaFavorites,
  normalizeMegaFolderUrlForCompare,
  removeMegaFavorite,
  type MegaLibraryNavTarget,
} from './lib/megaFavorites'
import {
  deleteCachedComic,
  estimateCacheBytes,
  listCachedComicMeta,
} from './lib/comicStorage'
import type { CachedComicMeta } from './lib/megaCachedViewer'
import { loadViewerPagesFromMegaCache } from './lib/megaCachedViewer'
import { cloudSourceKind } from './lib/cloudSource'

type ViewerState = {
  title: string
  pages: ViewerPage[]
  initialPageIndex: number
  session: ViewerSession
}

export default function App() {
  const [, bump] = useState(0)
  const [progressTick, bumpProgressTick] = useState(0)
  const [section, setSection] = useState<ShellNavId>('home')
  const [showSettings, setShowSettings] = useState(false)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [continueBusyKey, setContinueBusyKey] = useState<string | null>(null)
  const [homeDownloads, setHomeDownloads] = useState<CachedComicMeta[]>([])
  const [homeCacheBytes, setHomeCacheBytes] = useState(0)
  const [homeOpeningId, setHomeOpeningId] = useState<string | null>(null)
  const [homeToast, setHomeToast] = useState<string | null>(null)
  const [backExitToast, setBackExitToast] = useState<string | null>(null)
  const [libraryNavTarget, setLibraryNavTarget] = useState<MegaLibraryNavTarget | null>(null)
  const [favoritesTick, bumpFavorites] = useState(0)

  const viewerRef = useRef<ViewerState | null>(null)
  const showSettingsRef = useRef(false)
  const lastPageIndexRef = useRef(0)
  const progressSaveTimerRef = useRef<number | null>(null)
  const backExitToastTimerRef = useRef<number | null>(null)
  const homeToastTimerRef = useRef<number | null>(null)
  const sectionHistoryRef = useRef<ShellNavId[]>(['home'])
  const suppressSectionHistoryPushRef = useRef(false)
  const lastBackPressMsRef = useRef(0)

  useEffect(() => {
    viewerRef.current = viewer
  }, [viewer])

  useEffect(() => {
    showSettingsRef.current = showSettings
  }, [showSettings])

  useEffect(() => {
    return () => {
      if (backExitToastTimerRef.current !== null) {
        window.clearTimeout(backExitToastTimerRef.current)
      }
      if (homeToastTimerRef.current !== null) {
        window.clearTimeout(homeToastTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (homeToastTimerRef.current !== null) {
      window.clearTimeout(homeToastTimerRef.current)
      homeToastTimerRef.current = null
    }
    if (!homeToast) return
    homeToastTimerRef.current = window.setTimeout(() => {
      setHomeToast(null)
      homeToastTimerRef.current = null
    }, 5000)
    return () => {
      if (homeToastTimerRef.current !== null) {
        window.clearTimeout(homeToastTimerRef.current)
        homeToastTimerRef.current = null
      }
    }
  }, [homeToast])

  useEffect(() => {
    if (suppressSectionHistoryPushRef.current) {
      suppressSectionHistoryPushRef.current = false
      return
    }
    const stack = sectionHistoryRef.current
    if (stack[stack.length - 1] !== section) {
      stack.push(section)
    }
  }, [section])

  const sources = getConfiguredMegaSources()
  const megaUrl = getMegaFolderUrl()
  const canChangeSource = hasEnvMegaSources() && sources.length >= 1
  const libraryReady = megaUrl.length > 0 && !needsSourceSelection()

  const refreshHomeDownloads = useCallback(() => {
    void listCachedComicMeta().then((rows) => {
      setHomeDownloads([...rows].sort((a, b) => b.downloadedAt - a.downloadedAt))
      setHomeCacheBytes(estimateCacheBytes(rows))
    })
  }, [])

  useEffect(() => {
    refreshHomeDownloads()
  }, [refreshHomeDownloads])

  useEffect(() => {
    if (section === 'downloads') refreshHomeDownloads()
  }, [section, refreshHomeDownloads])

  useEffect(() => {
    if (section !== 'library') setLibraryNavTarget(null)
  }, [section])

  const refresh = useCallback(() => {
    bump((k) => k + 1)
  }, [])

  const bumpProgressTickFn = useCallback(() => {
    bumpProgressTick((k) => k + 1)
  }, [])

  const handlePageIndexChange = useCallback(
    (pageIndex: number) => {
      lastPageIndexRef.current = pageIndex
      const v = viewerRef.current
      if (!v) return
      if (progressSaveTimerRef.current !== null) {
        clearTimeout(progressSaveTimerRef.current)
      }
      progressSaveTimerRef.current = window.setTimeout(() => {
        progressSaveTimerRef.current = null
        upsertReadingProgress(
          buildProgressFromViewer(v.session, v.title, pageIndex, v.pages.length),
        )
        bumpProgressTickFn()
      }, 400)
    },
    [bumpProgressTickFn],
  )

  const handleOpenComic = useCallback(
    (title: string, pages: ViewerPage[], ctx: { megaCacheId: string }) => {
      lastPageIndexRef.current = 0
      const session: ViewerSession = { kind: 'mega', cacheId: ctx.megaCacheId }
      upsertReadingProgress(buildProgressFromViewer(session, title, 0, pages.length))
      bumpProgressTickFn()
      setViewer({ title, pages, initialPageIndex: 0, session })
    },
    [bumpProgressTickFn],
  )

  const handleOpenLocalComic = useCallback(
    async (payload: LocalComicOpenPayload) => {
      setSection('library')
      refresh()
      const blobId = crypto.randomUUID()
      await persistLocalArchiveForReading(blobId, payload.archiveFileName, payload.archiveBuffer)
      const session: ViewerSession = { kind: 'local', blobId }
      lastPageIndexRef.current = 0
      upsertReadingProgress(
        buildProgressFromViewer(session, payload.title, 0, payload.pages.length),
      )
      bumpProgressTickFn()
      setMegaLibraryEntered()
      setViewer({
        title: payload.title,
        pages: payload.pages,
        initialPageIndex: 0,
        session,
      })
    },
    [bumpProgressTickFn, refresh],
  )

  const handleContinueReading = useCallback(
    async (p: ReadingProgress) => {
      const k = readingProgressKey(p)
      setContinueBusyKey(k)
      try {
        const loaded = await loadViewerFromProgress(p)
        if (!loaded) {
          removeReadingProgress(p)
          await removePreviousLocalBlobIfAny(p)
          bumpProgressTickFn()
          return
        }
        lastPageIndexRef.current = loaded.initialPageIndex
        setMegaLibraryEntered()
        setViewer({
          title: loaded.title,
          pages: loaded.pages,
          initialPageIndex: loaded.initialPageIndex,
          session: loaded.session,
        })
        upsertReadingProgress(
          buildProgressFromViewer(
            loaded.session,
            loaded.title,
            loaded.initialPageIndex,
            loaded.pages.length,
          ),
        )
        bumpProgressTickFn()
      } finally {
        setContinueBusyKey(null)
      }
    },
    [bumpProgressTickFn],
  )

  const handleForgetReading = useCallback(
    async (p: ReadingProgress) => {
      await removePreviousLocalBlobIfAny(p)
      removeReadingProgress(p)
      bumpProgressTickFn()
    },
    [bumpProgressTickFn],
  )

  const closeViewer = useCallback(() => {
    if (progressSaveTimerRef.current !== null) {
      clearTimeout(progressSaveTimerRef.current)
      progressSaveTimerRef.current = null
    }
    const v = viewerRef.current
    if (v) {
      upsertReadingProgress(
        buildProgressFromViewer(
          v.session,
          v.title,
          lastPageIndexRef.current,
          v.pages.length,
        ),
      )
      bumpProgressTickFn()
    }
    setViewer((prev) => {
      if (prev) {
        for (const p of prev.pages) {
          URL.revokeObjectURL(p.url)
        }
      }
      return null
    })
  }, [bumpProgressTickFn])

  const viewerKey = viewer
    ? `${viewer.session.kind}-${
        viewer.session.kind === 'mega' ? viewer.session.cacheId : viewer.session.blobId
      }`
    : 'none'

  const handleHomeOpenDownload = useCallback(
    async (meta: CachedComicMeta) => {
      setHomeToast(null)
      setHomeOpeningId(meta.id)
      try {
        const payload = await loadViewerPagesFromMegaCache(meta)
        setMegaLibraryEntered()
        handleOpenComic(payload.title, payload.pages, { megaCacheId: payload.megaCacheId })
      } catch (e) {
        setHomeToast(e instanceof Error ? e.message : String(e))
      } finally {
        setHomeOpeningId(null)
      }
    },
    [handleOpenComic],
  )

  const handleRemoveHomeDownload = useCallback(
    (id: string, displayName: string) => {
      if (!window.confirm(`¿Quitar «${displayName}» del dispositivo?`)) return
      void deleteCachedComic(id).then(() => refreshHomeDownloads())
    },
    [refreshHomeDownloads],
  )

  const viewerEl =
    viewer ? (
      <ComicViewer
        key={viewerKey}
        title={viewer.title}
        pages={viewer.pages}
        initialPageIndex={viewer.initialPageIndex}
        onPageIndexChange={handlePageIndexChange}
        onClose={closeViewer}
      />
    ) : null

  const continueHidden = !!viewer
  const readingItems = useMemo(() => getReadingList(), [progressTick])
  const favoriteItems = useMemo(() => getMegaFavorites(), [favoritesTick])

  const handleGoToLibraryFromFavorite = useCallback((target: MegaLibraryNavTarget) => {
    const want = normalizeMegaFolderUrlForCompare(target.megaFolderUrl)
    const cur = normalizeMegaFolderUrlForCompare(getMegaFolderUrl())
    if (want !== cur) {
      const sources = getConfiguredMegaSources()
      const match = sources.find(
        (s) => normalizeMegaFolderUrlForCompare(s.url) === want,
      )
      if (match) {
        setStoredSourceSlot(match.slot)
        setUseManualMegaUrl(false)
      } else {
        setMegaFolderUrl(target.megaFolderUrl)
        setUseManualMegaUrl(true)
      }
      refresh()
    }
    setLibraryNavTarget(target)
    setSection('library')
  }, [refresh])

  const handleRemoveFavorite = useCallback((fileId: string, displayName: string) => {
    if (!window.confirm(`¿Quitar «${displayName}» de favoritos?`)) return
    removeMegaFavorite(fileId)
    bumpFavorites((k) => k + 1)
  }, [])

  const consumeLibraryNavTarget = useCallback(() => {
    setLibraryNavTarget(null)
  }, [])

  const handleNavigate = useCallback((id: ShellNavId) => {
    setSection(id)
  }, [])

  const handleAppBack = useCallback((): boolean => {
    if (viewerRef.current) {
      closeViewer()
      return true
    }

    if (showSettingsRef.current) {
      setShowSettings(false)
      return true
    }

    const stack = sectionHistoryRef.current
    if (stack.length > 1) {
      stack.pop()
      const prev = stack[stack.length - 1] ?? 'home'
      suppressSectionHistoryPushRef.current = true
      setSection(prev)
      return true
    }

    return false
  }, [closeViewer])

  useEffect(() => {
    const isMobileViewport = window.matchMedia('(max-width: 899px)').matches
    if (!isMobileViewport) return

    const marker = { __comicreadBackTrap: true }
    window.history.pushState(marker, '')

    const onPopState = () => {
      const handled = handleAppBack()
      if (handled) {
        window.history.pushState(marker, '')
        return
      }

      const now = Date.now()
      if (now - lastBackPressMsRef.current < 1500) {
        // Segunda pulsación: no reinsertamos el estado para permitir salir.
        return
      }
      lastBackPressMsRef.current = now
      setBackExitToast('Pulsa atrás otra vez para salir de la app.')
      if (backExitToastTimerRef.current !== null) {
        window.clearTimeout(backExitToastTimerRef.current)
      }
      backExitToastTimerRef.current = window.setTimeout(() => {
        setBackExitToast(null)
        backExitToastTimerRef.current = null
      }, 1400)
      window.history.pushState(marker, '')
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [handleAppBack])

  const needsManualSetup = !hasEnvMegaSources() && !megaUrl

  if (needsManualSetup) {
    return (
      <>
        <BibliotecaSectionBackdrop backdropKey="settings" layout="fullscreen">
          <SettingsPanel onSaved={refresh} initialSetup activeMegaFolderUrl={megaUrl} />
        </BibliotecaSectionBackdrop>
        {viewerEl}
      </>
    )
  }

  if (showSettings) {
    return (
      <>
        <PwaUpdateGate />
        <BibliotecaSectionBackdrop backdropKey="settings" layout="fullscreen">
          <SettingsPanel
            onSaved={() => {
              refresh()
            }}
            onCancel={() => setShowSettings(false)}
            activeMegaFolderUrl={megaUrl}
          />
        </BibliotecaSectionBackdrop>
        {viewerEl}
      </>
    )
  }

  const shellContent = (() => {
    switch (section) {
      case 'home':
        return (
          <HomePage
            onGoSources={() => setSection('sources')}
            onGoLibrary={() => setSection('library')}
            libraryReady={libraryReady}
          />
        )
      case 'sources':
        return (
          <SourcePicker
            sources={sources}
            onSelect={() => {
              setMegaLibraryEntered()
              setSection('library')
              refresh()
            }}
            onOpenLocalComic={handleOpenLocalComic}
          />
        )
      case 'library': {
        if (!libraryReady) {
          return (
            <div className="panel library-gate">
              <h1 className="library-gate-title">Biblioteca</h1>
              <p className="lead">
                Para continuar, elige una fuente en la sección <strong>Fuentes</strong>.
              </p>
              <button type="button" className="home-cta" onClick={() => setSection('sources')}>
                Ir a Fuentes
              </button>
            </div>
          )
        }
        const kind = cloudSourceKind(megaUrl)
        if (kind === 'mega') {
          return (
            <MegaBrowser
              megaFolderUrl={megaUrl}
              onOpenSettings={() => setShowSettings(true)}
              onChangeSource={
                canChangeSource
                  ? () => {
                      clearMegaLibraryEntered()
                      setSection('sources')
                    }
                  : undefined
              }
              onOpenComic={handleOpenComic}
              onOpenLocalComic={handleOpenLocalComic}
              libraryNavTarget={libraryNavTarget}
              onLibraryNavTargetConsumed={consumeLibraryNavTarget}
              onFavoritesChanged={() => bumpFavorites((k) => k + 1)}
            />
          )
        }
        return (
          <div className="panel library-gate">
            <h1 className="library-gate-title">Biblioteca</h1>
            <p className="lead">
              La URL activa no es un enlace MEGA válido (carpeta compartida con clave tras{' '}
              <code>#</code>).
            </p>
            <button type="button" className="home-cta" onClick={() => setSection('sources')}>
              Ir a Fuentes
            </button>
          </div>
        )
      }
      case 'favorites':
        return (
          <FavoritesSection
            items={favoriteItems}
            currentMegaFolderUrl={megaUrl}
            libraryReady={libraryReady}
            onGoToLibrary={handleGoToLibraryFromFavorite}
            onRemove={handleRemoveFavorite}
          />
        )
      case 'downloads':
        return (
          <DownloadsSection
            rows={homeDownloads}
            cacheBytes={homeCacheBytes}
            onRefresh={refreshHomeDownloads}
            onOpen={handleHomeOpenDownload}
            openingId={homeOpeningId}
            onRemove={handleRemoveHomeDownload}
          />
        )
      case 'continue':
        return (
          <ContinueReadingPage
            items={readingItems}
            busyId={continueBusyKey}
            onContinue={handleContinueReading}
            onForget={handleForgetReading}
          />
        )
      default:
        return null
    }
  })()

  return (
    <>
      <PwaUpdateGate />
      {homeToast ? (
        <div className="toast toast--global" role="status" aria-live="polite">
          {homeToast}
        </div>
      ) : null}
      {backExitToast ? (
        <div className="toast toast--back-exit" role="status" aria-live="polite">
          {backExitToast}
        </div>
      ) : null}
      <AppShell
        active={section}
        onNavigate={handleNavigate}
        libraryDisabled={!libraryReady}
        onOpenSettings={() => setShowSettings(true)}
        navHidden={continueHidden}
      >
        {section === 'library' ? (
          shellContent
        ) : (
          <BibliotecaSectionBackdrop backdropKey={section} layout="inset">
            {shellContent}
          </BibliotecaSectionBackdrop>
        )}
      </AppShell>
      {viewerEl}
    </>
  )
}
