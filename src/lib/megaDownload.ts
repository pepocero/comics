import type { File as MegaFile } from 'megajs'
import { toArrayBuffer } from './bufferToArrayBuffer'

const DOWNLOAD_ATTEMPTS = 3
const RETRY_BASE_MS = 700

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export type MegaDownloadOptions = {
  /** Límite 1…10. Por defecto 3 (descargas normales). Exportación masiva puede pedir más. */
  maxAttempts?: number
}

function errText(err: unknown): string {
  return err instanceof Error
    ? `${err.name} ${err.message}`
    : typeof err === 'string'
      ? err
      : String(err)
}

/** Errores de red / servidor que a veces se resuelven reintentando (p. ej. net::ERR_CONNECTION_RESET). */
export function isTransientMegaDownloadFailure(err: unknown): boolean {
  const s = errText(err)
  const l = s.toLowerCase()
  return (
    l.includes('reset') ||
    l.includes('econnreset') ||
    l.includes('etimedout') ||
    l.includes('network') ||
    l.includes('failed to fetch') ||
    l.includes('load failed') ||
    l.includes('aborted') ||
    l.includes('err_connection') ||
    l.includes('connection closed') ||
    l.includes('networkerror')
  )
}

export function isMegaBandwidthLimitReached(err: unknown): boolean {
  const l = errText(err).toLowerCase()
  return (
    l.includes('bandwidth limit reached') ||
    l.includes('limit reached') ||
    l.includes('509 status code')
  )
}

export function extractMegaBandwidthLimitSeconds(err: unknown): number | null {
  const s = errText(err)
  const patterns = [
    /bandwidth limit reached:\s*(\d+)\s*seconds?/i,
    /(\d+)\s*seconds?\s*until/i,
    /time-left[^\d]*(\d+)/i,
  ]
  for (const p of patterns) {
    const m = s.match(p)
    if (!m) continue
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

function formatSecondsAsEsDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min`
  return `${s} s`
}

/** Mensaje amigable para UI cuando MEGA bloquea por cuota temporal. */
export function megaBandwidthLimitAlertMessage(err: unknown): string | null {
  if (!isMegaBandwidthLimitReached(err)) return null
  const secs = extractMegaBandwidthLimitSeconds(err)
  if (secs === null) {
    return 'MEGA alcanzó el límite temporal de descarga para esta IP. Espera un rato e inténtalo de nuevo.'
  }
  return `MEGA alcanzó el límite temporal de descarga para esta IP. Tiempo estimado para reintentar: ${formatSecondsAsEsDuration(secs)}.`
}

/**
 * Una sola pasada de descarga megajs (stream).
 * `maxConnections: 1` usa un único fetch + ReadableStream en el navegador: evita casos donde
 * el modo multi-chunk no emite `end` y la promesa no se resuelve (p. ej. algunos entornos en producción).
 */
function downloadMegaFileToArrayBufferOnce(
  file: MegaFile,
  onProgress: (percent: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const stream = file.download({ maxConnections: 1 })
    const chunks: Uint8Array[] = []
    let settled = false
    let hangTimer: number | null = null

    const clearHangTimer = (): void => {
      if (hangTimer !== null) {
        clearTimeout(hangTimer)
        hangTimer = null
      }
    }

    const finish = (): void => {
      if (settled) return
      settled = true
      clearHangTimer()
      const totalLen = chunks.reduce((a, c) => a + c.length, 0)
      const merged = new Uint8Array(totalLen)
      let offset = 0
      for (const c of chunks) {
        merged.set(c, offset)
        offset += c.length
      }
      resolve(toArrayBuffer(merged))
    }

    const fail = (err: unknown): void => {
      if (settled) return
      settled = true
      clearHangTimer()
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    stream.on('progress', (data: { bytesLoaded: number; bytesTotal: number }) => {
      const total = Math.max(1, data.bytesTotal)
      const pct = Math.min(100, Math.round((data.bytesLoaded / total) * 100))
      onProgress(pct)
      if (pct >= 100) {
        clearHangTimer()
        hangTimer = window.setTimeout(() => {
          if (!settled) {
            fail(
              new Error(
                'La descarga no terminó correctamente tras el 100%. Prueba de nuevo o usa otro navegador.',
              ),
            )
          }
        }, 20000)
      }
    })
    stream.on('data', (chunk: Uint8Array | { length: number; [i: number]: number }) => {
      chunks.push(
        chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayLike<number>),
      )
    })
    stream.on('end', () => {
      finish()
    })
    stream.on('error', fail)
  })
}

/**
 * Descarga con eventos `progress` de megajs y reintentos ante fallos de red transitorios.
 */
export async function downloadMegaFileToArrayBuffer(
  file: MegaFile,
  onProgress: (percent: number) => void,
  options?: MegaDownloadOptions,
): Promise<ArrayBuffer> {
  const maxAttempts = Math.max(1, Math.min(10, options?.maxAttempts ?? DOWNLOAD_ATTEMPTS))
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      onProgress(0)
      return await downloadMegaFileToArrayBufferOnce(file, onProgress)
    } catch (e) {
      lastErr = e
      if (attempt < maxAttempts && isTransientMegaDownloadFailure(e)) {
        await sleep(RETRY_BASE_MS * attempt)
        continue
      }
      throw e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
