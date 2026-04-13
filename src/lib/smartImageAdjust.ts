import type { ImageAdjustState } from './imageAdjust'

export type SmartAdjustValues = Pick<
  ImageAdjustState,
  'brightness' | 'contrast' | 'saturation' | 'sharpness'
>

const MAX_ANALYSIS_SIDE = 512

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * A partir de píxeles de la página actual, estima brillo/contraste/saturación/nitidez
 * para los filtros CSS del visor (mismos rangos que el modo manual).
 */
export function analyzeImageDataForAdjust(imageData: ImageData): SmartAdjustValues {
  const w = imageData.width
  const h = imageData.height
  const d = imageData.data

  let sumL = 0
  let sumL2 = 0
  let sumS = 0
  let count = 0

  for (let p = 0; p < d.length; p += 16) {
    const r = d[p] / 255
    const g = d[p + 1] / 255
    const b = d[p + 2] / 255
    const L = 0.299 * r + 0.587 * g + 0.114 * b
    sumL += L
    sumL2 += L * L
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const S = mx < 1e-6 ? 0 : (mx - mn) / mx
    sumS += S
    count++
  }

  const meanL = sumL / count
  const stdL = Math.sqrt(Math.max(0, sumL2 / count - meanL * meanL))
  const meanS = sumS / count

  const brightness = clamp(Math.round(100 + (0.48 - meanL) * 78), 50, 150)
  const contrast = clamp(Math.round(100 + (0.19 - stdL) * 115), 50, 150)
  const saturation = clamp(Math.round(100 + (0.24 - meanS) * 52), 50, 150)

  const gw = Math.max(48, Math.min(256, Math.floor(w / 2)))
  const gh = Math.max(48, Math.min(256, Math.floor(h / 2)))
  const gray = new Float32Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const sx = Math.min(w - 1, Math.floor((gx / Math.max(gw - 1, 1)) * (w - 1)))
      const sy = Math.min(h - 1, Math.floor((gy / Math.max(gh - 1, 1)) * (h - 1)))
      const i = (sy * w + sx) * 4
      const r = d[i] / 255
      const gch = d[i + 1] / 255
      const b = d[i + 2] / 255
      gray[gy * gw + gx] = 0.299 * r + 0.587 * gch + 0.114 * b
    }
  }

  let lapEnergy = 0
  let lapN = 0
  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const p = gy * gw + gx
      const v =
        -gray[p - gw] - gray[p - 1] + 4 * gray[p] - gray[p + 1] - gray[p + gw]
      lapEnergy += v * v
      lapN++
    }
  }
  const lapVar = lapN > 0 ? lapEnergy / lapN : 0

  let sharpness = 0
  if (lapVar < 0.00055) sharpness = 40
  else if (lapVar < 0.0012) sharpness = 30
  else if (lapVar < 0.0028) sharpness = 18
  else if (lapVar < 0.0065) sharpness = 9
  else if (lapVar < 0.014) sharpness = 4

  return {
    brightness,
    contrast,
    saturation,
    sharpness: clamp(sharpness, 0, 100),
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen para el análisis.'))
    if (/^https?:/i.test(url)) {
      img.crossOrigin = 'anonymous'
    }
    img.src = url
  })
}

/**
 * Descarga la imagen (blob: o http), la muestrea en canvas y devuelve ajustes sugeridos.
 */
export async function computeSmartImageAdjust(imageUrl: string): Promise<SmartAdjustValues> {
  const img = await loadImageElement(imageUrl)
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  if (nw < 1 || nh < 1) {
    throw new Error('Imagen sin dimensiones válidas.')
  }

  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(nw, nh))
  const rw = Math.max(1, Math.round(nw * scale))
  const rh = Math.max(1, Math.round(nh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = rw
  canvas.height = rh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('No se pudo crear el contexto de análisis.')
  }
  ctx.drawImage(img, 0, 0, rw, rh)
  const imageData = ctx.getImageData(0, 0, rw, rh)
  return analyzeImageDataForAdjust(imageData)
}
