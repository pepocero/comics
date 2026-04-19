/** Origen de la URL de biblioteca (solo carpetas MEGA). */

function tryHost(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isMegaFolderUrl(url: string): boolean {
  const h = tryHost(url)
  if (!h) return false
  return h === 'mega.nz' || h === 'mega.co.nz' || h === 'www.mega.nz' || h === 'www.mega.co.nz'
}

export function cloudSourceKind(url: string): 'mega' | 'unknown' {
  const t = url.trim()
  if (!t) return 'unknown'
  if (isMegaFolderUrl(t)) return 'mega'
  return 'unknown'
}
