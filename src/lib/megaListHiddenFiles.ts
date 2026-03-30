/**
 * Archivos que no deben mostrarse en el listado de Biblioteca MEGA (accesos web, etc.).
 */

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

export function isMegaListHiddenFile(name: string | null | undefined): boolean {
  const n = normalizeName(name)
  if (n.endsWith('.url')) return true
  if (n.endsWith('.html')) return true
  if (n.endsWith('.htm')) return true
  return false
}
