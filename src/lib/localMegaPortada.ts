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

/**
 * Misma regla que al exportar portadas a ZIP: nombre de archivo sin extensión a partir del nombre
 * de carpeta MEGA (para coincidir con `public/portadas/urlN/*.jpg` etc.).
 */
export function sanitizeMegaPortadaFileBase(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 120)
}

const LOCAL_PORTADA_EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'gif'] as const

function portadaPublicUrl(slot: MegaSourceSlot, fileBaseWithExt: string): string {
  const enc = encodeURIComponent(fileBaseWithExt)
  return `/portadas/url${slot + 1}/${enc}`
}

/**
 * `slot` 0…7 = `VITE_MEGA_FOLDER_URL_1…8` → `public/portadas/url{slot+1}/` (p. ej. slot 7 → `url8`).
 *
 * Prueba en orden: prefijo numérico (`001.…` → `001.ext`) y nombre completo sanitizado (como
 * genera la exportación cuando no hay prefijo o para coincidir con archivos nombrados igual que la carpeta).
 */
export function localPortadaUrlCandidates(
  folderName: string | null | undefined,
  slot: MegaSourceSlot | null,
): string[] {
  if (slot === null) return []

  const bases: string[] = []
  const seen = new Set<string>()
  const pushBase = (b: string): void => {
    const t = b.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    bases.push(t)
  }

  const stem = extractFolderImageStem(folderName)
  if (stem) pushBase(stem)
  pushBase(sanitizeMegaPortadaFileBase(folderName))

  if (bases.length === 0) return []

  const out: string[] = []
  for (const base of bases) {
    for (const ext of LOCAL_PORTADA_EXTENSIONS) {
      out.push(portadaPublicUrl(slot, `${base}.${ext}`))
    }
  }
  return out
}

/** Primera ruta teórica (.webp). */
export function resolveLocalPortadaUrl(
  folderName: string | null | undefined,
  slot: MegaSourceSlot | null,
): string {
  const c = localPortadaUrlCandidates(folderName, slot)
  return c[0] ?? MEGA_FOLDER_GENERIC_COVER
}
