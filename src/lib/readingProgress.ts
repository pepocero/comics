import { prepareViewerPagesFromArchive } from './extractComicForViewer'
import {
  deleteLocalReadingBlob,
  getCachedComic,
  getLocalReadingBlob,
  putLocalReadingBlob,
} from './comicStorage'
import type { ViewerPage } from '../components/ComicViewer'

const LS_KEY_LEGACY = 'comicread-last-reading-v1'
const LS_KEY_LIST = 'comicread-reading-list-v1'

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

function parseProgressUnknown(item: unknown): ReadingProgress | null {
  if (!item || typeof item !== 'object') return null
  return parseStored(JSON.stringify(item))
}

function parseList(json: string | null): ReadingProgress[] {
  if (!json) return []
  try {
    const v = JSON.parse(json) as unknown
    if (!Array.isArray(v)) return []
    const out: ReadingProgress[] = []
    for (const item of v) {
      const p = parseProgressUnknown(item)
      if (p) out.push(p)
    }
    return out
  } catch {
    return []
  }
}

function migrateLegacyIfNeeded(): void {
  try {
    const legacy = localStorage.getItem(LS_KEY_LEGACY)
    if (!legacy) return
    const p = parseStored(legacy)
    if (p) {
      const cur = localStorage.getItem(LS_KEY_LIST)
      if (!cur || cur === '[]') {
        localStorage.setItem(LS_KEY_LIST, JSON.stringify([p]))
      }
    }
    localStorage.removeItem(LS_KEY_LEGACY)
  } catch {
    /* ignore */
  }
}

function progressKey(p: ReadingProgress): string {
  if (p.source === 'mega') return `mega:${p.megaCacheId}`
  return `local:${p.localBlobId}`
}

/** Clave estable para listas React y estado de carga. */
export function readingProgressKey(p: ReadingProgress): string {
  return progressKey(p)
}

function persistList(list: ReadingProgress[]): void {
  try {
    localStorage.setItem(LS_KEY_LIST, JSON.stringify(list))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Todas las lecturas en curso, más recientes primero. */
export function getReadingList(): ReadingProgress[] {
  migrateLegacyIfNeeded()
  const list = parseList(localStorage.getItem(LS_KEY_LIST))
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function findReadingBySession(session: ViewerSession): ReadingProgress | null {
  const list = getReadingList()
  const key =
    session.kind === 'mega' ? `mega:${session.cacheId}` : `local:${session.blobId}`
  return list.find((p) => progressKey(p) === key) ?? null
}

export function upsertReadingProgress(p: ReadingProgress): void {
  migrateLegacyIfNeeded()
  const list = parseList(localStorage.getItem(LS_KEY_LIST))
  const k = progressKey(p)
  const idx = list.findIndex((x) => progressKey(x) === k)
  if (idx >= 0) list[idx] = p
  else list.push(p)
  persistList(list)
}

export function removeReadingProgress(p: ReadingProgress): void {
  migrateLegacyIfNeeded()
  const list = parseList(localStorage.getItem(LS_KEY_LIST))
  const k = progressKey(p)
  persistList(list.filter((x) => progressKey(x) !== k))
}

export function clearAllReadingProgress(): void {
  try {
    localStorage.removeItem(LS_KEY_LIST)
    localStorage.removeItem(LS_KEY_LEGACY)
  } catch {
    /* ignore */
  }
}

/** @deprecated Usar getReadingList; se mantiene por compatibilidad con código legado */
export function getReadingProgress(): ReadingProgress | null {
  const list = getReadingList()
  return list[0] ?? null
}

/** @deprecated Usar upsertReadingProgress */
export function saveReadingProgress(p: ReadingProgress): void {
  upsertReadingProgress(p)
}

/** @deprecated Usar removeReadingProgress o clearAllReadingProgress */
export function clearReadingProgress(): void {
  clearAllReadingProgress()
}

/** Guarda el archivo local en IndexedDB para poder reanudar sin volver a elegir el archivo. */
export async function persistLocalArchiveForReading(
  blobId: string,
  fileName: string,
  data: ArrayBuffer,
): Promise<void> {
  await putLocalReadingBlob({ id: blobId, fileName, data })
}

/** Solo para olvidar una entrada local concreta. */
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
    const pages = await prepareViewerPagesFromArchive(cached.data, cached.name)
    if (pages.length === 0) return null
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
  const pages = await prepareViewerPagesFromArchive(row.data, row.fileName)
  if (pages.length === 0) return null
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
