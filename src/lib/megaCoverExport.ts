import { File as MegaFile } from 'megajs'
import { zipSync } from 'fflate'
import { parseMegaFolderUrl } from './parseMegaFolderUrl'
import {
  downloadMegaFileToArrayBuffer,
  extractMegaBandwidthLimitSeconds,
  isMegaBandwidthLimitReached,
  isTransientMegaDownloadFailure,
} from './megaDownload'
import { formatBytes } from './formatBytes'
import { extractComicPagesRemote } from './extractComicForViewer'
import type { ComicPage } from './comicArchive'
import { isMegaListHiddenFile } from './megaListHiddenFiles'
import { isMegaSeparatorPlaceholderFolder } from './megaPlaceholderFolder'
import { extractFolderImageStem, sanitizeMegaPortadaFileBase } from './localMegaPortada'

export type MegaCoverExportProgress = {
  doneFolders: number
  totalFolders: number
  currentFolder: string
  currentFile: string
  currentFilePercent: number
  /** 0–100: carpetas completadas + avance de la descarga actual. */
  overallPercent: number
}

function pctFoldersDone(doneCount: number, totalFolders: number): number {
  const n = Math.max(1, totalFolders)
  return Math.min(100, Math.round((doneCount / n) * 100))
}

function pctDuringFolderDownload(
  folderIndex0: number,
  totalFolders: number,
  filePercent: number,
): number {
  const n = Math.max(1, totalFolders)
  const frac = (folderIndex0 + Math.min(100, Math.max(0, filePercent)) / 100) / n
  return Math.min(100, Math.round(frac * 100))
}

export type MegaCoverExportResult = {
  zipBlob: Blob
  okCount: number
  skippedCount: number
  errorCount: number
  bandwidthLimitHitCount: number
  maxBandwidthWaitSeconds: number | null
  report: string
}

const COMIC_ARCHIVE_EXT = ['.cbz', '.cbr', '.zip', '.rar']

/** Pausa entre descargas para no saturar el CDN de MEGA (reduce ERR_CONNECTION_RESET). */
const COVER_EXPORT_COOLDOWN_MS = 550

/** Reintentos de todo el bloque descarga + extracción ante fallos de red intermitentes. */
const COVER_EXPORT_FULL_ATTEMPTS = 5
const COVER_EXPORT_FULL_RETRY_BASE_MS = 1100

/** Más intentos por descarga en exportación masiva que en lectura normal. */
const COVER_EXPORT_DOWNLOAD_MAX_ATTEMPTS = 7

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function isComicArchiveName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase()
  return COMIC_ARCHIVE_EXT.some((ext) => n.endsWith(ext))
}

function sortEntries(files: MegaFile[]): MegaFile[] {
  return [...files].sort((a, b) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1
    return (a.name || '').localeCompare(b.name || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

function getVisibleEntries(folder: MegaFile): MegaFile[] {
  const raw = folder.directory ? sortEntries(folder.children ?? []) : []
  return raw.filter((f) => {
    if (f.directory && isMegaSeparatorPlaceholderFolder(f.name)) return false
    if (isMegaListHiddenFile(f.name)) return false
    return true
  })
}

/** Recorre el subárbol y devuelve todos los cómics listables (mismo criterio de visibilidad que la UI). */
function collectArchivesInSubtree(folder: MegaFile, acc: MegaFile[]): void {
  const entries = getVisibleEntries(folder)
  for (const f of entries) {
    if (!f.directory && isComicArchiveName(f.name)) acc.push(f)
    if (f.directory) collectArchivesInSubtree(f, acc)
  }
}

/**
 * Para portada solo hace falta la primera imagen: elegir el archivo **más pequeño**
 * del subárbol acelera mucho frente a descargar un tomo/omnibus grande.
 */
function pickSmallestArchiveForCover(candidates: MegaFile[]): MegaFile | null {
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => {
    const sa = typeof a.size === 'number' && a.size >= 0 ? a.size : Number.MAX_SAFE_INTEGER
    const sb = typeof b.size === 'number' && b.size >= 0 ? b.size : Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    return (a.name || '').localeCompare(b.name || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })[0]
}

function extensionFromMimeType(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('png')) return 'png'
  if (t.includes('gif')) return 'gif'
  if (t.includes('webp')) return 'webp'
  if (t.includes('bmp')) return 'bmp'
  return 'jpg'
}

export async function exportMegaRootFolderCoversZip(
  megaFolderUrl: string,
  onProgress?: (progress: MegaCoverExportProgress) => void,
): Promise<MegaCoverExportResult> {
  const parsed = parseMegaFolderUrl(megaFolderUrl)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }

  const root = MegaFile.fromURL(parsed.url)
  const loaded = (await root.loadAttributes()) as MegaFile
  if (!loaded.directory) {
    throw new Error('La fuente MEGA no apunta a una carpeta.')
  }

  const folders = getVisibleEntries(loaded).filter((f) => f.directory)
  const totalFolders = folders.length
  onProgress?.({
    doneFolders: 0,
    totalFolders,
    currentFolder: '',
    currentFile: '',
    currentFilePercent: 0,
    overallPercent: 0,
  })
  const filesForZip: Record<string, Uint8Array> = {}
  const lines: string[] = []
  let okCount = 0
  let skippedCount = 0
  let errorCount = 0
  let bandwidthLimitHitCount = 0
  let maxBandwidthWaitSeconds: number | null = null

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]
    const folderName = (folder.name || '').trim() || `carpeta_${i + 1}`

    if (folder.directory && getVisibleEntries(folder).length === 0) {
      try {
        await folder.loadAttributes()
      } catch {
        /* si el nodo ya venía completo en el árbol, puede ignorarse */
      }
    }

    const candidates: MegaFile[] = []
    collectArchivesInSubtree(folder, candidates)
    const archive = pickSmallestArchiveForCover(candidates)

    if (!archive) {
      skippedCount++
      lines.push(`SKIP  | ${folderName} | sin .cbz/.cbr/.zip/.rar en el subárbol`)
      onProgress?.({
        doneFolders: i + 1,
        totalFolders,
        currentFolder: folderName,
        currentFile: '',
        currentFilePercent: 0,
        overallPercent: pctFoldersDone(i + 1, totalFolders),
      })
      continue
    }

    const archiveName = (archive.name || '').trim() || 'archivo'
    const archiveBytes =
      typeof archive.size === 'number' && archive.size >= 0 ? archive.size : null
    const sizeHint = archiveBytes !== null ? formatBytes(archiveBytes) : 'tamaño desconocido'

    let didDownload = false
    try {
      let pages: ComicPage[] | null = null

      for (let attempt = 1; attempt <= COVER_EXPORT_FULL_ATTEMPTS; attempt++) {
        try {
          const buffer = await downloadMegaFileToArrayBuffer(
            archive,
            (percent) => {
              onProgress?.({
                doneFolders: i,
                totalFolders,
                currentFolder: folderName,
                currentFile: archiveName,
                currentFilePercent: percent,
                overallPercent: pctDuringFolderDownload(i, totalFolders, percent),
              })
            },
            { maxAttempts: COVER_EXPORT_DOWNLOAD_MAX_ATTEMPTS },
          )
          didDownload = true
          pages = await extractComicPagesRemote(buffer, archiveName)
          if (pages.length === 0) {
            skippedCount++
            lines.push(`SKIP  | ${folderName} | ${archiveName} | sin imágenes`)
            pages = null
            break
          }
          break
        } catch (e) {
          if (isMegaBandwidthLimitReached(e)) {
            bandwidthLimitHitCount++
            const secs = extractMegaBandwidthLimitSeconds(e)
            if (secs !== null) {
              maxBandwidthWaitSeconds =
                maxBandwidthWaitSeconds === null ? secs : Math.max(maxBandwidthWaitSeconds, secs)
            }
          }
          if (attempt < COVER_EXPORT_FULL_ATTEMPTS && isTransientMegaDownloadFailure(e)) {
            await sleep(COVER_EXPORT_FULL_RETRY_BASE_MS * attempt)
            continue
          }
          errorCount++
          const msg = e instanceof Error ? e.message : String(e)
          lines.push(`ERROR | ${folderName} | ${archiveName} | ${msg}`)
          pages = null
          break
        }
      }

      if (pages && pages.length > 0) {
        const firstPage = pages[0]
        const ab = await firstPage.blob.arrayBuffer()
        const outNameBase =
          extractFolderImageStem(folderName) ??
          (sanitizeMegaPortadaFileBase(folderName) || `carpeta_${i + 1}`)
        const ext = extensionFromMimeType(firstPage.blob.type)
        let outName = `${outNameBase}.${ext}`
        let collision = 1
        while (filesForZip[outName]) {
          outName = `${outNameBase}_${collision}.${ext}`
          collision++
        }
        filesForZip[outName] = new Uint8Array(ab)
        okCount++
        lines.push(
          `OK    | ${folderName} | ${archiveName} (${sizeHint}, más pequeño de ${candidates.length}) -> ${outName}`,
        )
      }
    } catch (e) {
      errorCount++
      const msg = e instanceof Error ? e.message : String(e)
      lines.push(`ERROR | ${folderName} | ${archiveName} | ${msg}`)
    }

    if (didDownload) {
      await sleep(COVER_EXPORT_COOLDOWN_MS)
    }

    onProgress?.({
      doneFolders: i + 1,
      totalFolders,
      currentFolder: folderName,
      currentFile: archiveName,
      currentFilePercent: 0,
      overallPercent: pctFoldersDone(i + 1, totalFolders),
    })
  }

  const report = [
    'Exportación de portadas (MEGA)',
    `Fecha: ${new Date().toLocaleString('es')}`,
    `Carpetas procesadas: ${totalFolders}`,
    `OK: ${okCount}`,
    `Omitidas: ${skippedCount}`,
    `Errores: ${errorCount}`,
    `Bloqueos por límite MEGA detectados: ${bandwidthLimitHitCount}`,
    `Espera máxima sugerida por MEGA: ${
      maxBandwidthWaitSeconds === null ? 'no indicada' : `${maxBandwidthWaitSeconds} s`
    }`,
    '',
    ...lines,
    '',
  ].join('\n')

  filesForZip['reporte_exportacion.txt'] = new TextEncoder().encode(report)

  if (okCount === 0) {
    throw new Error(
      'No se pudo extraer ninguna portada. Revisa el reporte para ver carpetas sin cómics o archivos no compatibles.',
    )
  }

  onProgress?.({
    doneFolders: totalFolders,
    totalFolders,
    currentFolder: 'Generando archivo ZIP…',
    currentFile: '',
    currentFilePercent: 0,
    overallPercent: 99,
  })

  const zipBytes = zipSync(filesForZip, { level: 6 })
  const zipCopy = new Uint8Array(zipBytes.byteLength)
  zipCopy.set(zipBytes)
  const zipBlob = new Blob([zipCopy], { type: 'application/zip' })

  onProgress?.({
    doneFolders: totalFolders,
    totalFolders,
    currentFolder: '',
    currentFile: '',
    currentFilePercent: 100,
    overallPercent: 100,
  })

  return {
    zipBlob,
    okCount,
    skippedCount,
    errorCount,
    bandwidthLimitHitCount,
    maxBandwidthWaitSeconds,
    report,
  }
}
