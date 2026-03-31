import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearMegaLibraryEntered,
  getConfiguredMegaSources,
  getMegaFolderUrl,
  hasEnvMegaSources,
  needsSourceSelection,
  setMegaLibraryEntered,
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
  const [libraryNavTarget, setLibraryNavTarget] = useState<MegaLibraryNavTarget | null>(null)
  const [favoritesTick, bumpFavorites] = useState(0)

  const viewerRef = useRef<ViewerState | null>(null)
  const lastPageIndexRef = useRef(0)
  const progressSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    viewerRef.current = viewer
  }, [viewer])

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
    setLibraryNavTarget(target)
    setSection('library')
  }, [])

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

  const needsManualSetup = !hasEnvMegaSources() && !megaUrl

  if (needsManualSetup) {
    return (
      <>
        <BibliotecaSectionBackdrop backdropKey="settings" layout="fullscreen">
          <SettingsPanel onSaved={refresh} initialSetup />
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
      case 'library':
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
        <div className="toast toast--global" role="status">
          {homeToast}
          <button
            type="button"
            className="toast-close"
            onClick={() => setHomeToast(null)}
            aria-label="Cerrar aviso"
          >
            ×
          </button>
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
