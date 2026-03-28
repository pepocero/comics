/** Slot 0…3 → VITE_MEGA_FOLDER_URL_1 … _4 */
export type MegaSourceSlot = 0 | 1 | 2 | 3

export type MegaSource = {
  slot: MegaSourceSlot
  label: string
  url: string
  /** true si definiste VITE_MEGA_SOURCE_LABEL_n: oculta el subtítulo «Cuenta N» */
  hasCustomLabel: boolean
}

const LS_MANUAL = 'comicread_mega_folder_url'
const LS_SLOT = 'comicread_mega_source_slot'

function envUrl(slot: MegaSourceSlot): string {
  if (slot === 0) return (import.meta.env.VITE_MEGA_FOLDER_URL_1 ?? '').trim()
  if (slot === 1) return (import.meta.env.VITE_MEGA_FOLDER_URL_2 ?? '').trim()
  if (slot === 2) return (import.meta.env.VITE_MEGA_FOLDER_URL_3 ?? '').trim()
  return (import.meta.env.VITE_MEGA_FOLDER_URL_4 ?? '').trim()
}

function envLabel(slot: MegaSourceSlot): string {
  if (slot === 0) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_1 ?? '').trim()
  if (slot === 1) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_2 ?? '').trim()
  if (slot === 2) return (import.meta.env.VITE_MEGA_SOURCE_LABEL_3 ?? '').trim()
  return (import.meta.env.VITE_MEGA_SOURCE_LABEL_4 ?? '').trim()
}

/**
 * Fuentes definidas en build (Vite): hasta 4 enlaces MEGA.
 * Si no hay ninguno, se puede usar solo URL manual en localStorage.
 */
export function getConfiguredMegaSources(): MegaSource[] {
  const out: MegaSource[] = []
  for (let s = 0; s < 4; s++) {
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
  if (n === 0 || n === 1 || n === 2 || n === 3) return n as MegaSourceSlot
  return null
}

export function setStoredSourceSlot(slot: MegaSourceSlot): void {
  localStorage.setItem(LS_SLOT, String(slot))
}

export function clearStoredSourceSlot(): void {
  localStorage.removeItem(LS_SLOT)
}

export function setMegaFolderUrl(url: string): void {
  if (!url.trim()) {
    localStorage.removeItem(LS_MANUAL)
    return
  }
  localStorage.setItem(LS_MANUAL, url.trim())
}

/** URL activa: fuentes env (una o varias) o enlace manual si no hay env. */
export function getMegaFolderUrl(): string {
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
