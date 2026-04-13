const LS_KEY = 'comicread_image_adjust_v1'

export type ImageAdjustMode = 'auto' | 'manual' | 'smart'

export type ImageAdjustState = {
  mode: ImageAdjustMode
  /** 50–150, 100 = neutro */
  brightness: number
  contrast: number
  saturation: number
  /** 0 = sin nitidez extra; 1–33 suave, 34–66 media, 67–100 fuerte (filtro SVG) */
  sharpness: number
}

export const defaultImageAdjust: ImageAdjustState = {
  mode: 'auto',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sharpness: 0,
}

/** Valores fijos pensados para escaneados de cómic (modo automático). */
const AUTO_FILTER =
  'brightness(1.08) contrast(1.14) saturate(1.06)'

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Referencias a filtros SVG definidos en el visor (feConvolveMatrix). */
function sharpnessFilterUrl(sharpness: number): string {
  const s = clamp(sharpness, 0, 100)
  if (s <= 0) return ''
  if (s <= 33) return ' url(#comic-sharpen-soft)'
  if (s <= 66) return ' url(#comic-sharpen-med)'
  return ' url(#comic-sharpen-strong)'
}

export function buildImageFilterCss(state: ImageAdjustState): string {
  let base: string
  if (state.mode === 'auto') {
    base = AUTO_FILTER
  } else {
    const b = clamp(state.brightness, 50, 150) / 100
    const c = clamp(state.contrast, 50, 150) / 100
    const s = clamp(state.saturation, 50, 150) / 100
    base = `brightness(${b}) contrast(${c}) saturate(${s})`
  }
  return `${base}${sharpnessFilterUrl(state.sharpness)}`.trim()
}

export function loadImageAdjust(): ImageAdjustState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { ...defaultImageAdjust }
    const p = JSON.parse(raw) as Partial<ImageAdjustState>
    if (p.mode !== 'auto' && p.mode !== 'manual' && p.mode !== 'smart') {
      return { ...defaultImageAdjust }
    }
    return {
      mode: p.mode,
      brightness: clamp(Number(p.brightness) || 100, 50, 150),
      contrast: clamp(Number(p.contrast) || 100, 50, 150),
      saturation: clamp(Number(p.saturation) || 100, 50, 150),
      sharpness: clamp(
        Number.isFinite(Number(p.sharpness)) ? Number(p.sharpness) : 0,
        0,
        100,
      ),
    }
  } catch {
    return { ...defaultImageAdjust }
  }
}

export function saveImageAdjust(state: ImageAdjustState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}
