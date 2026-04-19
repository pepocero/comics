/**
 * Lógica basada en
 * https://github.com/muxfox/Terabox-Downloader-API (listado + proxy de descarga).
 * Requiere cookie de sesión Terabox en el entorno del Worker (`TERABOX_COOKIE`).
 */

export type TeraboxListItem = {
  name: string
  size: number | null
  /** URL absoluta al proxy de descarga del mismo despliegue. */
  dlink: string
}

function findBetween(str: string, start: string, end: string): string {
  const i = str.indexOf(start)
  if (i === -1) return ''
  const startIndex = i + start.length
  const endIndex = str.indexOf(end, startIndex)
  if (endIndex === -1) return ''
  return str.slice(startIndex, endIndex)
}

function buildHeaders(cookie: string): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    Connection: 'keep-alive',
    DNT: '1',
    Host: 'www.terabox.app',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0',
    'sec-ch-ua': '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    Cookie: cookie,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  }
}

export function buildDlHeaders(cookie: string): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    Referer: 'https://terabox.com/',
    DNT: '1',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    Cookie: cookie,
  }
}

/**
 * Obtiene la lista de archivos del enlace compartido (misma API que muxfox; hasta num entradas).
 */
export async function listTeraboxShareFiles(
  shareLink: string,
  cookie: string,
  requestUrl: string,
  listNum = 50,
): Promise<{ ok: true; items: TeraboxListItem[] } | { ok: false; error: string }> {
  try {
    if (!shareLink.trim()) {
      return { ok: false, error: 'El enlace no puede estar vacío.' }
    }

    const HEADERS = buildHeaders(cookie)

    let response = await fetch(shareLink, { headers: HEADERS })
    if (!response.ok) {
      return { ok: false, error: `No se pudo abrir el enlace (${response.status}).` }
    }

    const finalUrl = response.url
    const url = new URL(finalUrl)
    const surl = url.searchParams.get('surl')
    if (!surl) {
      return { ok: false, error: 'Enlace inválido (falta surl tras redirección).' }
    }

    response = await fetch(finalUrl, { headers: HEADERS })
    const text = await response.text()

    const jsToken = findBetween(text, 'fn%28%22', '%22%29')
    const logid = findBetween(text, 'dp-logid=', '&')
    const bdstoken = findBetween(text, 'bdstoken":"', '"')

    if (!jsToken || !logid || !bdstoken) {
      return { ok: false, error: 'No se pudieron extraer tokens (cookie caducada o Terabox cambió la página).' }
    }

    const params = new URLSearchParams({
      app_id: '250528',
      web: '1',
      channel: 'dubox',
      clienttype: '0',
      jsToken,
      'dp-logid': logid,
      page: '1',
      num: String(listNum),
      by: 'name',
      order: 'asc',
      site_referer: finalUrl,
      shorturl: surl,
      root: '1,',
    })

    response = await fetch(`https://www.terabox.com/share/list?${params}`, { headers: HEADERS })
    const data = (await response.json()) as {
      list?: Array<{
        isdir?: string | number
        server_filename?: string
        dlink?: string
        size?: string | number
        thumbs?: { url3?: string }
      }>
      errno?: number
      errmsg?: string
    }

    if (!data?.list?.length || data.errno) {
      return { ok: false, error: data.errmsg || 'No se pudo obtener la lista de archivos.' }
    }

    const origin = new URL(requestUrl).origin
    const items: TeraboxListItem[] = []

    for (const fileInfo of data.list) {
      if (fileInfo.isdir === 1 || fileInfo.isdir === '1') continue
      const name = fileInfo.server_filename || ''
      const rawDlink = fileInfo.dlink || ''
      if (!name || !rawDlink) continue

      const sizeNum = parseInt(String(fileInfo.size ?? 0), 10)
      /** Absoluta: el cliente puede usar otro origen (p. ej. VITE_TERABOX_RESOLVER_URL en dev). */
      const dlUrl = `${origin}/api/terabox-dl?url=${encodeURIComponent(rawDlink)}&file_name=${encodeURIComponent(name)}`
      items.push({
        name,
        size: Number.isFinite(sizeNum) ? sizeNum : null,
        dlink: dlUrl,
      })
    }

    if (items.length === 0) {
      return { ok: false, error: 'La carpeta no contiene archivos listables o solo tiene subcarpetas.' }
    }

    return { ok: true, items }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Error al listar Terabox: ${msg}` }
  }
}
