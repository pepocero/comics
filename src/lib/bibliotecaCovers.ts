/**
 * Portadas locales: lista de archivos en /public/bibliotecas/ definida en covers.json
 * (orden = orden de uso; se repite al superar el número de imágenes).
 */

let cachedUrls: string[] | null = null
let inflight: Promise<string[]> | null = null

function normalizeList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue
    const name = item.trim().replace(/^\/+/, '')
    if (name.includes('..') || name.includes('\\')) continue
    out.push(`/bibliotecas/${encodeURI(name)}`)
  }
  return out
}

/** Carga /bibliotecas/covers.json una vez (nombres de archivo relativos a esa carpeta). */
export function loadBibliotecaCoverUrls(): Promise<string[]> {
  if (cachedUrls !== null) return Promise.resolve(cachedUrls)
  if (inflight) return inflight
  inflight = fetch('/bibliotecas/covers.json', { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) return []
      return res.json() as Promise<unknown>
    })
    .then((data) => normalizeList(data))
    .catch(() => [] as string[])
    .then((urls) => {
      cachedUrls = urls
      return urls
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function coverUrlForFolderIndex(urls: string[], index: number): string | null {
  if (urls.length === 0 || index < 0) return null
  return urls[index % urls.length] ?? null
}
