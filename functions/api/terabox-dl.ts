/**
 * GET /api/terabox-dl — proxy de descarga Terabox (Range + cookie en servidor).
 * Basado en https://github.com/muxfox/Terabox-Downloader-API (proxyDownload).
 */
import { buildDlHeaders } from '../_teraboxCore'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
}

function isAllowedTeraboxDlTarget(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const h = u.hostname.toLowerCase()
  if (h.includes('terabox')) return true
  if (h.includes('1024tera') || h.includes('1024terabox')) return true
  if (h.endsWith('pcloud.com') || h.includes('.pcloud.')) return true
  return false
}

type Env = { TERABOX_COOKIE?: string }

export async function onRequest(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const cookie = (env.TERABOX_COOKIE ?? '').trim()
  if (!cookie) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          'TERABOX_COOKIE no configurado en el entorno del Worker. Configura el secreto en Cloudflare Pages o usa otro resolver.',
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const urlObj = new URL(request.url)
  const rawTarget = urlObj.searchParams.get('url')
  const fileName = urlObj.searchParams.get('file_name') || 'download'

  if (!rawTarget) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta el parámetro url' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let target: URL
  try {
    target = new URL(rawTarget)
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'URL inválida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!isAllowedTeraboxDlTarget(target)) {
    return new Response(JSON.stringify({ ok: false, error: 'Dominio de descarga no permitido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const headers = new Headers(buildDlHeaders(cookie))
  const rangeHeader = request.headers.get('Range')
  if (rangeHeader) {
    headers.set('Range', rangeHeader)
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      headers,
      redirect: 'follow',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ ok: false, error: `Proxy: ${msg}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(
      JSON.stringify({ ok: false, error: `Descarga fallida: ${upstream.status}` }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  const responseHeaders = new Headers({
    ...corsHeaders,
    'Cache-Control': 'public, max-age=3600',
    'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    'Accept-Ranges': 'bytes',
  })

  if (upstream.headers.has('Content-Range')) {
    responseHeaders.set('Content-Range', upstream.headers.get('Content-Range')!)
  }
  if (upstream.headers.has('Content-Length')) {
    responseHeaders.set('Content-Length', upstream.headers.get('Content-Length')!)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}
