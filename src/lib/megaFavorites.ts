/** Objetivo para abrir la biblioteca en la carpeta de un favorito. */
export type MegaLibraryNavTarget = {
  megaFolderUrl: string
  pathLabels: string[]
  fileId: string
}

const LS_KEY = 'comicread-mega-favorites-v1'
const MAX_ITEMS = 400
const MAX_PATH_DEPTH = 64
const MAX_STRING = 2048

export type MegaFavoriteRecord = {
  fileId: string
  megaFolderUrl: string
  name: string
  size: number | null
  pathLabels: string[]
  addedAt: number
}

function parseRecord(raw: unknown): MegaFavoriteRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.fileId !== 'string' || o.fileId.length === 0 || o.fileId.length > 512) return null
  if (typeof o.megaFolderUrl !== 'string' || o.megaFolderUrl.length > MAX_STRING) return null
  if (typeof o.name !== 'string' || o.name.length > MAX_STRING) return null
  if (typeof o.addedAt !== 'number' || !Number.isFinite(o.addedAt)) return null
  let size: number | null = null
  if (o.size != null) {
    if (typeof o.size !== 'number' || !Number.isFinite(o.size) || o.size < 0) return null
    size = o.size
  }
  if (!Array.isArray(o.pathLabels)) return null
  if (o.pathLabels.length > MAX_PATH_DEPTH) return null
  const pathLabels: string[] = []
  for (const p of o.pathLabels) {
    if (typeof p !== 'string' || p.length > MAX_STRING) return null
    pathLabels.push(p)
  }
  return { fileId: o.fileId, megaFolderUrl: o.megaFolderUrl, name: o.name, size, pathLabels, addedAt: o.addedAt }
}

function parseList(json: string | null): MegaFavoriteRecord[] {
  if (!json) return []
  try {
    const v = JSON.parse(json) as unknown
    if (!Array.isArray(v)) return []
    const out: MegaFavoriteRecord[] = []
    for (const item of v) {
      const r = parseRecord(item)
      if (r) out.push(r)
    }
    return out
  } catch {
    return []
  }
}

function persist(list: MegaFavoriteRecord[]): void {
  const trimmed = list.slice(0, MAX_ITEMS)
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed))
}

export function getMegaFavorites(): MegaFavoriteRecord[] {
  return parseList(localStorage.getItem(LS_KEY))
}

export function isMegaFavoriteFileId(fileId: string): boolean {
  return getMegaFavorites().some((f) => f.fileId === fileId)
}

export function upsertMegaFavorite(rec: MegaFavoriteRecord): void {
  const cur = getMegaFavorites().filter((f) => f.fileId !== rec.fileId)
  cur.unshift(rec)
  persist(cur)
}

export function removeMegaFavorite(fileId: string): void {
  persist(getMegaFavorites().filter((f) => f.fileId !== fileId))
}

export function buildMegaFavoriteRecord(input: {
  fileId: string
  megaFolderUrl: string
  name: string
  size: number | null
  pathLabels: string[]
}): MegaFavoriteRecord {
  return {
    fileId: input.fileId,
    megaFolderUrl: input.megaFolderUrl,
    name: input.name,
    size: input.size,
    pathLabels: input.pathLabels,
    addedAt: Date.now(),
  }
}
