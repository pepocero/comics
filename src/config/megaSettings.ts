/** Slot 0-based: corresponde a VITE_MEGA_FOLDER_URL_{slot+1} y a `public/portadas/url{slot+1}/`. */
export type MegaSourceSlot = number

export type MegaSource = {
  slot: MegaSourceSlot
  label: string
  url: string
  /** true si definiste VITE_MEGA_SOURCE_LABEL_n: oculta el subtítulo «Cuenta N» */
  hasCustomLabel: boolean
}

const LS_MANUAL = 'comicread_mega_folder_url'
/** Si está activo y hay texto en LS_MANUAL, esa URL tiene prioridad sobre las fuentes Vite (enlace pegado en Fuentes). */
const LS_USE_MANUAL = 'comicread_mega_use_manual'
const LS_SLOT = 'comicread_mega_source_slot'
const LS_MEGA_LIBRARY_ENTERED = 'comicread_mega_library_entered'

/** Tras entrar a la biblioteca MEGA (explorador); la página de inicio es el selector de fuente hasta que esto esté activo. */
export function isMegaLibraryEntered(): boolean {
  try {
    return localStorage.getItem(LS_MEGA_LIBRARY_ENTERED) === '1'
  } catch {
    return false
  }
}

export function setMegaLibraryEntered(): void {
  try {
    localStorage.setItem(LS_MEGA_LIBRARY_ENTERED, '1')
  } catch {
    /* ignore */
  }
}

export function clearMegaLibraryEntered(): void {
  try {
    localStorage.removeItem(LS_MEGA_LIBRARY_ENTERED)
  } catch {
    /* ignore */
  }
}

/**
 * Fuentes definidas en build: cualquier `VITE_MEGA_FOLDER_URL_<n>` y opcional `VITE_MEGA_SOURCE_LABEL_<n>` (n ≥ 1).
 * La lista se inyecta en build desde `vite.config.ts` (`__COMICREAD_MEGA_SOURCES__`).
 * Si no hay claves numeradas, se usa `VITE_MEGA_FOLDER_URL` como única fuente (n=1).
 */
export function getConfiguredMegaSources(): MegaSource[] {
  const out: MegaSource[] = []
  for (const row of __COMICREAD_MEGA_SOURCES__) {
    const url = row.url.trim()
    if (!url) continue
    const n = row.n
    const slot = n - 1
    const rawLabel = row.label.trim()
    const hasCustomLabel = rawLabel.length > 0
    const label = hasCustomLabel ? rawLabel : `Cuenta ${n}`
    out.push({ slot, label, url, hasCustomLabel })
  }
  return out
}

export function getStoredSourceSlot(): MegaSourceSlot | null {
  const raw = localStorage.getItem(LS_SLOT)
  if (raw === null) return null
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return null
  const sources = getConfiguredMegaSources()
  if (!sources.some((s) => s.slot === n)) return null
  return n
}

/**
 * Slot de env activo → `public/portadas/url{slot+1}/`
 * (`VITE_MEGA_FOLDER_URL_1` → url1, `VITE_MEGA_FOLDER_URL_9` → url9).
 */
export function getMegaSourceSlotForPortada(activeFolderUrl: string): MegaSourceSlot | null {
  if (isUsingManualMegaUrl()) return null
  const trimmed = activeFolderUrl.trim()
  if (!trimmed) return null
  const sources = getConfiguredMegaSources()
  if (sources.length === 0) return null

  const norm = (s: string): string => s.trim()
  const found = sources.find((s) => norm(s.url) === norm(trimmed))
  if (found) return found.slot

  if (sources.length === 1) return sources[0].slot

  const slot = getStoredSourceSlot()
  if (slot === null) return null
  return sources.some((s) => s.slot === slot) ? slot : null
}

export function setStoredSourceSlot(slot: MegaSourceSlot): void {
  localStorage.setItem(LS_SLOT, String(slot))
}

export function clearStoredSourceSlot(): void {
  localStorage.removeItem(LS_SLOT)
}

export function setMegaFolderUrl(url: string): void {
  try {
    if (!url.trim()) {
      localStorage.removeItem(LS_MANUAL)
      localStorage.removeItem(LS_USE_MANUAL)
      return
    }
    localStorage.setItem(LS_MANUAL, url.trim())
  } catch {
    /* ignore */
  }
}

export function setUseManualMegaUrl(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(LS_USE_MANUAL, '1')
    } else {
      localStorage.removeItem(LS_USE_MANUAL)
    }
  } catch {
    /* ignore */
  }
}

export function isUsingManualMegaUrl(): boolean {
  try {
    return localStorage.getItem(LS_USE_MANUAL) === '1'
  } catch {
    return false
  }
}

/** URL activa: fuentes env (una o varias) o enlace manual si no hay env. */
export function getMegaFolderUrl(): string {
  try {
    const manual = (localStorage.getItem(LS_MANUAL) ?? '').trim()
    if (localStorage.getItem(LS_USE_MANUAL) === '1' && manual.length > 0) {
      return manual
    }
  } catch {
    /* ignore */
  }
  const sources = getConfiguredMegaSources()
  if (sources.length === 0) {
    return (localStorage.getItem(LS_MANUAL) ?? '').trim()
  }
  if (sources.length === 1) {
    return sources[0].url
  }
  const slot = getStoredSourceSlot()
  if (slot === null) return ''
  const found = sources.find((s) => s.slot === slot)
  return found?.url ?? ''
}

/** Hay varias cuentas en env y aún no se eligió una (o el slot guardado ya no existe). */
export function needsSourceSelection(): boolean {
  if (isUsingManualMegaUrl()) return false
  const sources = getConfiguredMegaSources()
  if (sources.length <= 1) return false
  const slot = getStoredSourceSlot()
  if (slot === null) return true
  return !sources.some((s) => s.slot === slot)
}

/** Texto del campo manual (solo modo sin VITE URLs). */
export function getManualMegaFolderUrl(): string {
  return (localStorage.getItem(LS_MANUAL) ?? '').trim()
}

export function hasEnvMegaSources(): boolean {
  return getConfiguredMegaSources().length > 0
}
