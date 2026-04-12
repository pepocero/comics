/** Slot 0…5 → VITE_MEGA_FOLDER_URL_1 … _6 */
export type MegaSourceSlot = 0 | 1 | 2 | 3 | 4 | 5

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

function envUrl(slot: MegaSourceSlot): string {
  if (slot === 0) return (import.meta.env.VITE_MEGA_FOLDER_URL_1 ?? '').trim()
  if (slot === 1) return (import.meta.env.VITE_MEGA_FOLDER_URL_2 ?? '').trim()
  if (slot === 2) return (import.meta.env.VITE_MEGA_FOLDER_URL_3 ?? '').trim()
  if (slot === 3) return (import.meta.env.VITE_MEGA_FOLDER_URL_4 ?? '').trim()
  if (slot === 4) return (import.meta.env.VITE_MEGA_FOLDER_URL_5 ?? '').trim()
  return (import.meta.env.VITE_MEGA_FOLDER_URL_6 ?? '').trim()
}

function envLabel(slot: MegaSourceSlot): string {
  if (slot === 0) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_1 ?? '').trim()
  if (slot === 1) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_2 ?? '').trim()
  if (slot === 2) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_3 ?? '').trim()
  if (slot === 3) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_4 ?? '').trim()
  if (slot === 4) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_5 ?? '').trim()
  return (import.meta.env.VITE_MEGA_SOURCE_LABEL_6 ?? '').trim()
}

/**
 * Fuentes definidas en build (Vite): hasta 6 enlaces MEGA.
 * Si no hay ninguno, se puede usar solo URL manual en localStorage.
 */
export function getConfiguredMegaSources(): MegaSource[] {
  const out: MegaSource[] = []
  for (let s = 0; s < 6; s++) {
    const slot = s as MegaSourceSlot
    const url = envUrl(slot)
    if (!url) continue
    const rawLabel = envLabel(slot)
    const hasCustomLabel = rawLabel.length > 0
    const label = rawLabel || `Cuenta ${s + 1}`
    out.push({ slot, label, url, hasCustomLabel })
  }
  const legacy = (import.meta.env.VITE_MEGA_FOLDER_URL ?? '').trim()
  if (out.length === 0 && legacy) {
    out.push({ slot: 0, label: 'MEGA', url: legacy, hasCustomLabel: false })
  }
  return out
}

export function getStoredSourceSlot(): MegaSourceSlot | null {
  const raw = localStorage.getItem(LS_SLOT)
  if (raw === null) return null
  const n = parseInt(raw, 10)
  if (n === 0 || n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n as MegaSourceSlot
  return null
}

/**
 * Slot de env activo → `public/portadas/url{slot+1}/`
 * (`VITE_MEGA_FOLDER_URL_1` → url1 … `URL_6` → url6).
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
