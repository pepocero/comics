import { getCachedComic, type CachedComicRecord } from './comicStorage'
import type { ViewerPage } from '../components/ComicViewer'
import { prepareViewerPagesFromArchive } from './extractComicForViewer'

export type CachedComicMeta = Omit<CachedComicRecord, 'data'>

export async function loadViewerPagesFromMegaCache(
  meta: CachedComicMeta,
): Promise<{ title: string; pages: ViewerPage[]; megaCacheId: string }> {
  const id = meta.id
  const name = meta.name
  const cached = await getCachedComic(id)
  if (!cached?.data) {
    throw new Error('El archivo ya no está en el dispositivo.')
  }
  const byteLen = cached.data.byteLength
  if (byteLen < 1) {
    throw new Error('El archivo en caché está vacío o dañado.')
  }
  const metaSize = Number(meta.size)
  if (metaSize > 0 && byteLen !== metaSize) {
    console.warn('[ComicRead] Metadatos de tamaño distintos al buffer guardado', {
      metaSize,
      byteLen,
      id,
    })
  }

  const pages = await prepareViewerPagesFromArchive(cached.data, name)
  if (pages.length === 0) {
    throw new Error('No se encontraron imágenes en el archivo en caché.')
  }
  return { title: name, pages, megaCacheId: id }
}
