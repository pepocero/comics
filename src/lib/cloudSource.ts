/** Origen de la URL de biblioteca (MEGA vs enlace compartido Terabox / similares). */

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

/** Enlace público tipo https://1024terabox.com/s/… o terabox.com/s/… */
export function isTeraboxShareUrl(url: string): boolean {
  const h = tryHost(url)
  if (!h) return false
  if (h === '1024terabox.com' || h === 'www.1024terabox.com') return true
  if (h === 'terabox.com' || h === 'www.terabox.com') return true
  if (h.endsWith('.terabox.com')) return true
  if (h.endsWith('.1024terabox.com')) return true
  return false
}

export function cloudSourceKind(url: string): 'mega' | 'terabox' | 'unknown' {
  const t = url.trim()
  if (!t) return 'unknown'
  if (isMegaFolderUrl(t)) return 'mega'
  if (isTeraboxShareUrl(t)) return 'terabox'
  return 'unknown'
}
