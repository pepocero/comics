/**
 * Resolución de enlaces Terabox → lista de archivos con enlace de descarga.
 * El servicio oficial suele exigir verificación; en el navegador se usa un resolver
 * configurable (proxy en dev, Cloudflare Function en prod, o URL propia).
 *
 * Compatible con:
 * - `{ ok, mapped: [{ name, size, dlink }] }` (terabox.page / proxy propio con cookie)
 * - Respuesta tipo muxfox: `{ file_name, proxy_url, download_link, size_bytes, error }`
 *   (@see https://github.com/muxfox/Terabox-Downloader-API)
 */

export type TeraboxMappedFile = {
  name: string
  size: number | null
  /** URL directa o proxificada (p. ej. /api/terabox-dl o worker /proxy). */
  dlink: string
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

function parseMappedArray(mapped: unknown): TeraboxMappedFile[] {
  if (!Array.isArray(mapped)) return []
  const out: TeraboxMappedFile[] = []
  for (const row of mapped) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const name = asString(r.name) ?? asString(r.filename) ?? asString(r.file_name)
    const dlink =
      asString(r.dlink) ??
      asString(r.proxy_url) ??
      asString(r.download_url) ??
      asString(r.download_link) ??
      asString(r.link)
    if (!name || !dlink) continue
    out.push({
      name,
      size: asNumber(r.size) ?? asNumber(r.bytes) ?? asNumber(r.size_bytes),
      dlink,
    })
  }
  return out
}

/**
 * POST JSON `{ "url": "<enlace>", "link": "<mismo enlace opcional para muxfox>" }` → lista o error.
 */
export async function fetchTeraboxShareFiles(shareUrl: string): Promise<TeraboxMappedFile[]> {
  const endpoint =
    (import.meta.env.VITE_TERABOX_RESOLVER_URL ?? '').trim() || '/api/terabox-proxy'

  const trimmed = shareUrl.trim()
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 120_000)

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed, link: trimmed }),
      signal: ctrl.signal,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort')) {
      throw new Error('Tiempo de espera agotado al resolver el enlace Terabox.')
    }
    throw new Error(
      `No se pudo contactar con el resolver Terabox (${endpoint}). Si estás en producción, configura VITE_TERABOX_RESOLVER_URL o despliega el proxy en /api/terabox-proxy. ${msg}`,
    )
  } finally {
    window.clearTimeout(timer)
  }

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text) as unknown
  } catch {
    const upstream502 =
      res.status === 502 || res.status === 503 || res.status === 504
    const hint = upstream502
      ? ' En desarrollo, el proxy de Vite reenvía a «terabox.page», que a menudo responde 502/503. Pon en .env TERABOX_DEV_PROXY_TARGET (y si hace falta TERABOX_DEV_PROXY_PATH=/ para un Worker tipo muxfox) o usa VITE_TERABOX_RESOLVER_URL con tu URL de Cloudflare / Worker.'
      : ''
    throw new Error(
      `El resolver Terabox devolvió un cuerpo no JSON (${res.status}).${hint} Revisa la consola de red.`,
    )
  }

  const o = json as Record<string, unknown>

  if (!res.ok) {
    const err =
      asString(o.error) ??
      asString(o.errmsg) ??
      `Error HTTP ${res.status} del resolver Terabox.`
    throw new Error(err)
  }

  if (o.ok === false) {
    const err = asString(o.error) ?? asString(o.errmsg) ?? 'Error desconocido del resolver Terabox.'
    throw new Error(err)
  }

  const errField = asString(o.error)
  if (errField && !Array.isArray(o.mapped)) {
    throw new Error(errField)
  }

  const fromMapped = parseMappedArray(o.mapped)
  if (fromMapped.length > 0) {
    return fromMapped
  }

  /** Respuesta de un solo archivo (worker muxfox u otro). */
  const singleName = asString(o.file_name) ?? asString(o.filename)
  const singleDlink =
    asString(o.proxy_url) ??
    asString(o.download_link) ??
    asString(o.dlink) ??
    asString(o.link)
  const singleSize = asNumber(o.size_bytes) ?? asNumber(o.size)

  if (singleName && singleDlink) {
    return [{ name: singleName, size: singleSize, dlink: singleDlink }]
  }

  throw new Error(
    'Respuesta del resolver Terabox sin lista «mapped» ni campos reconocibles (file_name + proxy_url / download_link).',
  )
}
