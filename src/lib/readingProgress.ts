import { extractComicPages } from './comicArchive'
import {
  deleteLocalReadingBlob,
  getCachedComic,
  getLocalReadingBlob,
  putLocalReadingBlob,
} from './comicStorage'
import type { ViewerPage } from '../components/ComicViewer'

const LS_KEY = 'comicread-last-reading-v1'

export type ViewerSession =
  | { kind: 'mega'; cacheId: string }
  | { kind: 'local'; blobId: string }

export type ReadingProgress =
  | {
      source: 'mega'
      megaCacheId: string
      title: string
      pageIndex: number
      totalPages: number
      updatedAt: number
    }
  | {
      source: 'local'
      localBlobId: string
      title: string
      pageIndex: number
      totalPages: number
      updatedAt: number
    }

export type OpenViewerPayload = {
  title: string
  pages: ViewerPage[]
  initialPageIndex: number
  session: ViewerSession
}

function parseStored(json: string | null): ReadingProgress | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as unknown
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    if (typeof o.title !== 'string' || typeof o.pageIndex !== 'number') return null
    if (typeof o.totalPages !== 'number' || typeof o.updatedAt !== 'number') return null
    if (o.source === 'mega' && typeof o.megaCacheId === 'string') {
      return {
        source: 'mega',
        megaCacheId: o.megaCacheId,
        title: o.title,
        pageIndex: o.pageIndex,
        totalPages: o.totalPages,
        updatedAt: o.updatedAt,
      }
    }
    if (o.source === 'local' && typeof o.localBlobId === 'string') {
      return {
        source: 'local',
        localBlobId: o.localBlobId,
        title: o.title,
        pageIndex: o.pageIndex,
        totalPages: o.totalPages,
        updatedAt: o.updatedAt,
      }
    }
    return null
  } catch {
    return null
  }
}

export function getReadingProgress(): ReadingProgress | null {
  try {
    return parseStored(localStorage.getItem(LS_KEY))
  } catch {
    return null
  }
}

export function saveReadingProgress(p: ReadingProgress): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearReadingProgress(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

/** Guarda el archivo local en IndexedDB para poder reanudar sin volver a elegir el archivo. */
export async function persistLocalArchiveForReading(
  blobId: string,
  fileName: string,
  data: ArrayBuffer,
): Promise<void> {
  await putLocalReadingBlob({ id: blobId, fileName, data })
}

export async function removePreviousLocalBlobIfAny(p: ReadingProgress | null): Promise<void> {
  if (p?.source === 'local') {
    await deleteLocalReadingBlob(p.localBlobId).catch(() => {})
  }
}

export async function loadViewerFromProgress(
  p: ReadingProgress,
): Promise<OpenViewerPayload | null> {
  if (p.source === 'mega') {
    const cached = await getCachedComic(p.megaCacheId)
    if (!cached?.data) return null
    const extracted = await extractComicPages(cached.data, cached.name)
    if (extracted.length === 0) return null
    const pages: ViewerPage[] = extracted.map((x) => ({
      name: x.name,
      url: URL.createObjectURL(x.blob),
    }))
    const totalPages = pages.length
    const pageIndex = Math.max(0, Math.min(p.pageIndex, totalPages - 1))
    return {
      title: cached.name.replace(/\.[^.]+$/, '') || cached.name,
      pages,
      initialPageIndex: pageIndex,
      session: { kind: 'mega', cacheId: p.megaCacheId },
    }
  }

  const row = await getLocalReadingBlob(p.localBlobId)
  if (!row?.data) return null
  const extracted = await extractComicPages(row.data, row.fileName)
  if (extracted.length === 0) return null
  const pages: ViewerPage[] = extracted.map((x) => ({
    name: x.name,
    url: URL.createObjectURL(x.blob),
  }))
  const totalPages = pages.length
  const pageIndex = Math.max(0, Math.min(p.pageIndex, totalPages - 1))
  return {
    title: row.fileName.replace(/\.[^.]+$/, '') || row.fileName,
    pages,
    initialPageIndex: pageIndex,
    session: { kind: 'local', blobId: p.localBlobId },
  }
}

export function buildProgressFromViewer(
  session: ViewerSession,
  title: string,
  pageIndex: number,
  totalPages: number,
): ReadingProgress {
  const updatedAt = Date.now()
  if (session.kind === 'mega') {
    return {
      source: 'mega',
      megaCacheId: session.cacheId,
      title,
      pageIndex,
      totalPages,
      updatedAt,
    }
  }
  return {
    source: 'local',
    localBlobId: session.blobId,
    title,
    pageIndex,
    totalPages,
    updatedAt,
  }
}
