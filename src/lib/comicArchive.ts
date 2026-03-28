import { unzipSync } from 'fflate'
import { Archive } from 'libarchive.js'
import { ensureLibarchiveInit } from './libarchiveInit'

const IMG = /\.(jpe?g|png|gif|webp|bmp)$/i

function naturalNameCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function isJunkPath(path: string): boolean {
  const n = path.replace(/\\/g, '/').toLowerCase()
  return (
    n.includes('__macosx/') ||
    n.endsWith('.ds_store') ||
    n.startsWith('.') ||
    n.includes('/.')
  )
}

function mimeForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}

function isRarMagic(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 6) return false
  const v = new Uint8Array(buf, 0, 6)
  const sig = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]
  return sig.every((b, i) => v[i] === b)
}

function isZipMagic(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false
  const v = new Uint8Array(buf, 0, 4)
  return v[0] === 0x50 && v[1] === 0x4b && (v[2] === 0x03 || v[2] === 0x05 || v[2] === 0x07)
}

export interface ComicPage {
  name: string
  blob: Blob
}

/**
 * Copia el buffer: algunos entornos (p. ej. buffers devueltos por IndexedDB) pueden fallar con fflate
 * si se pasa la vista directamente.
 */
function uint8CopyOfArrayBuffer(buffer: ArrayBuffer): Uint8Array {
  const u8 = new Uint8Array(buffer.byteLength)
  u8.set(new Uint8Array(buffer))
  return u8
}

function extractZipPages(buffer: ArrayBuffer): ComicPage[] {
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(uint8CopyOfArrayBuffer(buffer))
  } catch {
    throw new Error('No se pudo leer el archivo como ZIP (.cbz).')
  }

  const entries: ComicPage[] = []
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith('/')) continue
    if (isJunkPath(path)) continue
    if (!IMG.test(path)) continue
    const name = path.replace(/\\/g, '/').split('/').pop() ?? path
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    entries.push({
      name,
      blob: new Blob([copy], { type: mimeForPath(path) }),
    })
  }

  if (entries.length === 0) {
    throw new Error('No se encontraron imágenes dentro del archivo.')
  }

  entries.sort((a, b) => naturalNameCompare(a.name, b.name))
  return entries
}

async function extractRarPages(
  buffer: ArrayBuffer,
  filenameHint: string,
): Promise<ComicPage[]> {
  ensureLibarchiveInit()

  const file = new File([new Uint8Array(buffer)], filenameHint, {
    type: 'application/octet-stream',
  })

  const reader = await Archive.open(file)
  try {
    await reader.extractFiles()
    const flat = (await reader.getFilesArray()) as {
      file: unknown
      path: string
    }[]

    const pages: ComicPage[] = []

    for (const item of flat) {
      const f = item.file
      if (!(f instanceof File)) continue

      const pathPart = typeof item.path === 'string' ? item.path : ''
      const fullPath = `${pathPart}${f.name}`.replace(/\\/g, '/')
      if (fullPath.endsWith('/')) continue
      if (isJunkPath(fullPath)) continue
      if (!IMG.test(fullPath)) continue

      const ab = await f.arrayBuffer()
      const copy = new Uint8Array(ab.byteLength)
      copy.set(new Uint8Array(ab))
      pages.push({
        name: fullPath.split('/').pop() ?? f.name,
        blob: new Blob([copy], { type: mimeForPath(fullPath) }),
      })
    }

    if (pages.length === 0) {
      throw new Error(
        'No se encontraron imágenes en el RAR. Archivos multi-volumen o cifrados pueden no ser compatibles.',
      )
    }

    pages.sort((a, b) => naturalNameCompare(a.name, b.name))
    return pages
  } finally {
    await reader.close().catch(() => {})
  }
}

/**
 * Extrae páginas de imagen de un .cbz/.zip (ZIP) o .cbr/.rar (RAR vía libarchive.js).
 * La firma del archivo tiene prioridad sobre la extensión: es habitual que un .cbr llegue
 * nombrado como .cbz (o al revés); en producción solo fallaba la ruta ZIP.
 */
export async function extractComicPages(
  buffer: ArrayBuffer,
  filenameHint: string,
): Promise<ComicPage[]> {
  const lower = filenameHint.toLowerCase()

  if (isRarMagic(buffer)) {
    const nameForRar =
      lower.endsWith('.rar') || lower.endsWith('.cbr') ? filenameHint : 'archivo.cbr'
    return extractRarPages(buffer, nameForRar)
  }
  if (isZipMagic(buffer)) {
    return extractZipPages(buffer)
  }

  if (lower.endsWith('.cbz') || lower.endsWith('.zip')) {
    return extractZipPages(buffer)
  }
  if (lower.endsWith('.cbr') || lower.endsWith('.rar')) {
    return extractRarPages(buffer, filenameHint)
  }

  throw new Error(
    'Formato no reconocido. Usa .cbz, .zip, .cbr o .rar con imágenes dentro.',
  )
}
