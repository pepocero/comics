const STORAGE_KEY = 'comicread-theme'

export type AppTheme = 'dark' | 'light'

/** Siempre oscuro salvo que el usuario haya elegido explícitamente «Claro» (valor guardado `light`). */
export const DEFAULT_APP_THEME: AppTheme = 'dark'

export function getStoredTheme(): AppTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light') return 'light'
    if (v !== null && v !== 'dark') {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* private mode / sin acceso */
  }
  return DEFAULT_APP_THEME
}

export function setStoredTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

/** Aplica tema en `<html>` y actualiza `theme-color` para la barra del sistema (PWA). */
export function applyTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
  setStoredTheme(theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#e8e4f0' : '#12121a')
  }
}

/** Llamar al arranque antes del primer paint si es posible. */
export function initThemeFromStorage(): void {
  applyTheme(getStoredTheme())
}
