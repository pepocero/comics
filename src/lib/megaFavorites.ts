import { getConfiguredMegaSources } from '../config/megaSettings'

/** Objetivo para abrir la biblioteca en la carpeta de un favorito. */
export type MegaLibraryNavTarget = {
  megaFolderUrl: string
  pathLabels: string[]
  fileId: string
  /** Si es true, tras ubicar el archivo se abre el visor (o descarga y abre si no está en caché). */
  openComic?: boolean
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

/** Misma carpeta MEGA aunque haya espacios al inicio/final al guardar. */
export function normalizeMegaFolderUrlForCompare(url: string): string {
  return url.trim()
}

/**
 * Etiqueta de la fuente cuyo enlace coincide con el guardado en el favorito.
 * Si el enlace ya no coincide con ninguna `VITE_MEGA_FOLDER_URL_*` (p. ej. enlace regenerado en MEGA),
 * se indica explícitamente para que no parezca un fallo de la app.
 */
export function resolveFavoriteMegaSourceLabel(megaFolderUrl: string): string {
  const n = normalizeMegaFolderUrlForCompare(megaFolderUrl)
  const sources = getConfiguredMegaSources()
  const hit = sources.find((s) => normalizeMegaFolderUrlForCompare(s.url) === n)
  if (hit) return hit.label
  if (sources.length === 0) return 'Enlace manual / no listado en fuentes'
  return 'Enlace distinto al configurado ahora (p. ej. enlace MEGA regenerado)'
}

/**
 * Misma obra (carpeta raíz + ruta + nombre de archivo): un solo favorito; gana el más reciente.
 * Evita entradas duplicadas con distinto fileId (p. ej. nodo MEGA distinto) que desincronizan la estrella.
 */
function dedupeMegaFavorites(list: MegaFavoriteRecord[]): MegaFavoriteRecord[] {
  const map = new Map<string, MegaFavoriteRecord>()
  for (const r of list) {
    const url = normalizeMegaFolderUrlForCompare(r.megaFolderUrl)
    const key = `${url}\0${r.pathLabels.join('\0')}\0${r.name}`
    const next: MegaFavoriteRecord = { ...r, megaFolderUrl: url }
    const prev = map.get(key)
    if (!prev || next.addedAt >= prev.addedAt) {
      map.set(key, next)
    }
  }
  return Array.from(map.values())
}

function persist(list: MegaFavoriteRecord[]): void {
  const trimmed = list.slice(0, MAX_ITEMS)
  localStorage.setItem(LS_KEY, JSON.stringify(trimmed))
}

export function getMegaFavorites(): MegaFavoriteRecord[] {
  const raw = parseList(localStorage.getItem(LS_KEY))
  const merged = dedupeMegaFavorites(raw)
  if (JSON.stringify(raw) !== JSON.stringify(merged)) {
    persist(merged)
  }
  return merged
}

export function isMegaFavoriteFileId(fileId: string): boolean {
  return getMegaFavorites().some((f) => f.fileId === fileId)
}

export function upsertMegaFavorite(rec: MegaFavoriteRecord): void {
  const normalized: MegaFavoriteRecord = {
    ...rec,
    megaFolderUrl: normalizeMegaFolderUrlForCompare(rec.megaFolderUrl),
  }
  const raw = parseList(localStorage.getItem(LS_KEY))
  const withoutId = raw.filter((f) => f.fileId !== normalized.fileId)
  const merged = dedupeMegaFavorites([normalized, ...withoutId])
  persist(merged)
}

export function removeMegaFavorite(fileId: string): void {
  const raw = parseList(localStorage.getItem(LS_KEY))
  persist(raw.filter((f) => f.fileId !== fileId))
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
