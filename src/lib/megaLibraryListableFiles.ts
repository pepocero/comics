/**
 * Archivos que se muestran al navegar carpetas en Biblioteca MEGA.
 * Carpetas se listan aparte (salvo placeholders); aquí solo extensiones de fichero.
 */
const LISTABLE_EXT = new Set([
  '.cbz',
  '.cbr',
  '.zip',
  '.rar',
  '.pdf',
  '.txt',
])

export function isMegaLibraryListableFile(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase()
  const i = n.lastIndexOf('.')
  if (i < 0 || i === n.length - 1) return false
  return LISTABLE_EXT.has(n.slice(i))
}
