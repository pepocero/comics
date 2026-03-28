import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearMegaLibraryEntered,
  getConfiguredMegaSources,
  getMegaFolderUrl,
  hasEnvMegaSources,
  isMegaLibraryEntered,
  needsSourceSelection,
  setMegaLibraryEntered,
} from './config/megaSettings'
import { SettingsPanel } from './components/SettingsPanel'
import { SourcePicker } from './components/SourcePicker'
import { MegaBrowser } from './components/MegaBrowser'
import { ComicViewer, type ViewerPage } from './components/ComicViewer'
import type { LocalComicOpenPayload } from './components/LocalComicOpenButton'
import { PwaUpdateGate } from './components/PwaUpdateGate'
import type { ViewerSession } from './lib/readingProgress'
import {
  deleteCachedComic,
  estimateCacheBytes,
  listCachedComicMeta,
} from './lib/comicStorage'
import type { CachedComicMeta } from './lib/megaCachedViewer'
import { loadViewerPagesFromMegaCache } from './lib/megaCachedViewer'
import {
  buildProgressFromViewer,
  clearReadingProgress,
  getReadingProgress,
  loadViewerFromProgress,
  persistLocalArchiveForReading,
  removePreviousLocalBlobIfAny,
  saveReadingProgress,
} from './lib/readingProgress'
import './index.css'

type ViewerState = {
  title: string
  pages: ViewerPage[]
  initialPageIndex: number
  session: ViewerSession
}

export default function App() {
  const [, bump] = useState(0)
  const [, bumpProgress] = useState(0)
  const [pickSource, setPickSource] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [continueBusy, setContinueBusy] = useState(false)
  const [homeDownloads, setHomeDownloads] = useState<CachedComicMeta[]>([])
  const [homeCacheBytes, setHomeCacheBytes] = useState(0)
  const [homeOpeningId, setHomeOpeningId] = useState<string | null>(null)
  const [homeToast, setHomeToast] = useState<string | null>(null)

  const viewerRef = useRef<ViewerState | null>(null)
  const lastPageIndexRef = useRef(0)
  const progressSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    viewerRef.current = viewer
  }, [viewer])

  const sources = getConfiguredMegaSources()
  const megaUrl = getMegaFolderUrl()
  const canChangeSource = hasEnvMegaSources() && sources.length >= 1
  const showSourcePicker =
    hasEnvMegaSources() &&
    sources.length >= 1 &&
    (pickSource || needsSourceSelection() || !isMegaLibraryEntered()) &&
    (needsSourceSelection() || megaUrl.length > 0)

  const refreshHomeDownloads = useCallback(() => {
    void listCachedComicMeta().then((rows) => {
      setHomeDownloads([...rows].sort((a, b) => b.downloadedAt - a.downloadedAt))
      setHomeCacheBytes(estimateCacheBytes(rows))
    })
  }, [])

  useEffect(() => {
    if (showSourcePicker) refreshHomeDownloads()
  }, [showSourcePicker, refreshHomeDownloads])

  useEffect(() => {
    if (!viewer && showSourcePicker) refreshHomeDownloads()
  }, [viewer, showSourcePicker, refreshHomeDownloads])

  const refresh = useCallback(() => {
    bump((k) => k + 1)
  }, [])

  const bumpProgressTick = useCallback(() => {
    bumpProgress((k) => k + 1)
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
        saveReadingProgress(
          buildProgressFromViewer(v.session, v.title, pageIndex, v.pages.length),
        )
        bumpProgressTick()
      }, 400)
    },
    [bumpProgressTick],
  )

  const handleOpenComic = useCallback(
    (title: string, pages: ViewerPage[], ctx: { megaCacheId: string }) => {
      const prevProgress = getReadingProgress()
      const session: ViewerSession = { kind: 'mega', cacheId: ctx.megaCacheId }
      lastPageIndexRef.current = 0
      saveReadingProgress(buildProgressFromViewer(session, title, 0, pages.length))
      bumpProgressTick()
      setViewer({ title, pages, initialPageIndex: 0, session })
      void removePreviousLocalBlobIfAny(prevProgress).catch(() => {})
    },
    [bumpProgressTick],
  )

  const handleOpenLocalComic = useCallback(
    async (payload: LocalComicOpenPayload) => {
      setPickSource(false)
      refresh()
      await removePreviousLocalBlobIfAny(getReadingProgress())
      const blobId = crypto.randomUUID()
      await persistLocalArchiveForReading(blobId, payload.archiveFileName, payload.archiveBuffer)
      const session: ViewerSession = { kind: 'local', blobId }
      lastPageIndexRef.current = 0
      saveReadingProgress(
        buildProgressFromViewer(session, payload.title, 0, payload.pages.length),
      )
      bumpProgressTick()
      setMegaLibraryEntered()
      setViewer({
        title: payload.title,
        pages: payload.pages,
        initialPageIndex: 0,
        session,
      })
    },
    [bumpProgressTick, refresh],
  )

  const handleContinueReading = useCallback(async () => {
    const p = getReadingProgress()
    if (!p) return
    setContinueBusy(true)
    try {
      const loaded = await loadViewerFromProgress(p)
      if (!loaded) {
        clearReadingProgress()
        bumpProgressTick()
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
      saveReadingProgress(
        buildProgressFromViewer(
          loaded.session,
          loaded.title,
          loaded.initialPageIndex,
          loaded.pages.length,
        ),
      )
      bumpProgressTick()
    } finally {
      setContinueBusy(false)
    }
  }, [bumpProgressTick])

  const handleForgetReading = useCallback(async () => {
    const p = getReadingProgress()
    await removePreviousLocalBlobIfAny(p)
    clearReadingProgress()
    bumpProgressTick()
  }, [bumpProgressTick])

  const closeViewer = useCallback(() => {
    if (progressSaveTimerRef.current !== null) {
      clearTimeout(progressSaveTimerRef.current)
      progressSaveTimerRef.current = null
    }
    const v = viewerRef.current
    if (v) {
      saveReadingProgress(
        buildProgressFromViewer(
          v.session,
          v.title,
          lastPageIndexRef.current,
          v.pages.length,
        ),
      )
      bumpProgressTick()
    }
    setViewer((prev) => {
      if (prev) {
        for (const p of prev.pages) {
          URL.revokeObjectURL(p.url)
        }
      }
      return null
    })
  }, [bumpProgressTick])

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

  if (showSourcePicker) {
    return (
      <>
        <PwaUpdateGate />
        {homeToast ? (
          <div className="toast" role="status">
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
        <SourcePicker
          sources={sources}
          onSelect={() => {
            setMegaLibraryEntered()
            setPickSource(false)
            refresh()
          }}
          onOpenLocalComic={handleOpenLocalComic}
          continueReadingHidden={continueHidden}
          onContinueReading={handleContinueReading}
          onForgetReading={handleForgetReading}
          continueReadingBusy={continueBusy}
          downloadRows={homeDownloads}
          cacheBytes={homeCacheBytes}
          onRefreshDownloads={refreshHomeDownloads}
          onOpenDownload={handleHomeOpenDownload}
          openingDownloadId={homeOpeningId}
          onRemoveDownload={handleRemoveHomeDownload}
        />
        {viewerEl}
      </>
    )
  }

  const needsManualSetup = !hasEnvMegaSources() && !megaUrl
  if (needsManualSetup) {
    return (
      <>
        <SettingsPanel onSaved={refresh} />
        {viewerEl}
      </>
    )
  }

  if (showSettings) {
    return (
      <>
        <PwaUpdateGate />
        <SettingsPanel
          onSaved={() => {
            refresh()
            setShowSettings(false)
          }}
          onCancel={() => setShowSettings(false)}
        />
        {viewerEl}
      </>
    )
  }

  return (
    <>
      <PwaUpdateGate />
      <MegaBrowser
        megaFolderUrl={megaUrl}
        onOpenSettings={() => setShowSettings(true)}
        onChangeSource={
          canChangeSource
            ? () => {
                clearMegaLibraryEntered()
                setPickSource(true)
              }
            : undefined
        }
        onOpenComic={handleOpenComic}
        onOpenLocalComic={handleOpenLocalComic}
        continueReadingHidden={continueHidden}
        onContinueReading={handleContinueReading}
        onForgetReading={handleForgetReading}
        continueReadingBusy={continueBusy}
      />
      {viewerEl}
    </>
  )
}
