/**
 * Depuración de portadas MEGA (desactivada por defecto).
 * En la consola del navegador (F12 → Consola):
 *   localStorage.setItem('comicread:debugPortada', '1')
 * Recarga la página. Para quitar los mensajes:
 *   localStorage.removeItem('comicread:debugPortada')
 */
export function isPortadaDebugEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('comicread:debugPortada') === '1'
  } catch {
    return false
  }
}

export function portadaDebug(...args: unknown[]): void {
  if (!isPortadaDebugEnabled()) return
  console.warn('[ComicRead portada]', ...args)
}
