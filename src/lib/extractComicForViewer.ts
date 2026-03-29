import type { ViewerPage } from '../components/ComicViewer'
import { extractComicPages, type ComicPage } from './comicArchive'

/** Cuántas URLs crear antes de ceder el hilo (móviles lentos). */
const CREATE_URL_CHUNK = 8

/**
 * Descomprime y extrae imágenes fuera del hilo principal cuando hay Web Worker.
 * Evita congelar la UI en ZIP/RAR grandes en móviles modestos.
 */
export async function extractComicPagesRemote(
  buffer: ArrayBuffer,
  filenameHint: string,
): Promise<ComicPage[]> {
  if (typeof Worker === 'undefined') {
    return extractComicPages(buffer, filenameHint)
  }
  try {
    return await runExtractInWorker(buffer, filenameHint)
  } catch {
    return extractComicPages(buffer, filenameHint)
  }
}

function runExtractInWorker(buffer: ArrayBuffer, filenameHint: string): Promise<ComicPage[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/comicExtract.worker.ts', import.meta.url), {
      type: 'module',
    })
    const fail = (err: unknown): void => {
      worker.terminate()
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    worker.onmessage = (
      ev: MessageEvent<
        { ok: true; pages: ComicPage[] } | { ok: false; error: string }
      >,
    ): void => {
      worker.terminate()
      const d = ev.data
      if (d.ok) resolve(d.pages)
      else reject(new Error(d.error))
    }
    worker.onerror = (e): void => {
      fail(e.error ?? new Error(e.message))
    }
    worker.postMessage({ buffer, filenameHint })
  })
}

/**
 * Crea object URLs por tandas con requestAnimationFrame para no bloquear pintado
 * al abrir cómics con muchas páginas.
 */
export async function comicPagesToViewerPages(pages: ComicPage[]): Promise<ViewerPage[]> {
  const out: ViewerPage[] = []
  for (let i = 0; i < pages.length; i++) {
    out.push({
      name: pages[i].name,
      url: URL.createObjectURL(pages[i].blob),
    })
    if ((i + 1) % CREATE_URL_CHUNK === 0 && i + 1 < pages.length) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
    }
  }
  return out
}

export async function prepareViewerPagesFromArchive(
  buffer: ArrayBuffer,
  filenameHint: string,
): Promise<ViewerPage[]> {
  const extracted = await extractComicPagesRemote(buffer, filenameHint)
  if (extracted.length === 0) return []
  return comicPagesToViewerPages(extracted)
}
