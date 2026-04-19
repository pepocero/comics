/**
 * Cloudflare Pages Function: POST /api/terabox-proxy
 * - Si existe TERABOX_COOKIE: listado vía API Terabox (lógica tipo muxfox, varios archivos).
 * - Si no: reenvío a terabox.page (comportamiento anterior).
 *
 * @see https://github.com/muxfox/Terabox-Downloader-API
 */
import { listTeraboxShareFiles } from '../_teraboxCore'

const UPSTREAM = 'https://terabox.page/api/proxy'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

type Env = { TERABOX_COOKIE?: string }

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const o = body as Record<string, unknown>
  const shareUrl =
    (typeof o.url === 'string' ? o.url.trim() : '') ||
    (typeof o.link === 'string' ? o.link.trim() : '')

  if (!shareUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta url o link' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const cookie = (env.TERABOX_COOKIE ?? '').trim()
  if (cookie) {
    const listed = await listTeraboxShareFiles(shareUrl, cookie, request.url, 50)
    if (!listed.ok) {
      return new Response(JSON.stringify({ ok: false, error: listed.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const mapped = listed.items.map((it) => ({
      name: it.name,
      size: it.size,
      dlink: it.dlink,
    }))
    return new Response(JSON.stringify({ ok: true, mapped }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: shareUrl }),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    },
  })
}
