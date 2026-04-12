import type { MegaSourceSlot } from '../config/megaSettings'

/** Si no hay carátula local o no coincide el prefijo numérico. */
export const MEGA_FOLDER_GENERIC_COVER = '/portadas/portada_generica.png'

/**
 * Nombre de archivo de carátula (sin extensión), igual al prefijo de la carpeta MEGA:
 * `002.La saga…` → `002`; `01. Alias` → `01` (tres cifras antes del punto si aplica; si no, dos).
 */
export function extractFolderImageStem(name: string | null | undefined): string | null {
  const n = (name ?? '').trim()
  const m3 = n.match(/^(\d{3})\./)
  if (m3) return m3[1]
  const m2 = n.match(/^(\d{2})\./)
  if (m2) return m2[1]
  return null
}

const LOCAL_PORTADA_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'gif'] as const

/**
 * `slot` 0…5 = `VITE_MEGA_FOLDER_URL_1…6` → `public/portadas/url{slot+1}/` (p. ej. slot 5 → `url6`).
 */
export function localPortadaUrlCandidates(
  folderName: string | null | undefined,
  slot: MegaSourceSlot | null,
): string[] {
  if (slot === null) return []
  const stem = extractFolderImageStem(folderName)
  if (!stem) return []
  const base = `/portadas/url${slot + 1}/${stem}`
  return LOCAL_PORTADA_EXTENSIONS.map((ext) => `${base}.${ext}`)
}

/** Primera ruta teórica (.webp). */
export function resolveLocalPortadaUrl(
  folderName: string | null | undefined,
  slot: MegaSourceSlot | null,
): string {
  const c = localPortadaUrlCandidates(folderName, slot)
  return c[0] ?? MEGA_FOLDER_GENERIC_COVER
}
