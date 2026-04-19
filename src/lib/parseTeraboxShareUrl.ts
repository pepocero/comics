export type ParseTeraboxResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Valida un enlace público de carpeta/archivo compartido Terabox (p. ej. 1024terabox.com/s/…).
 */
export function parseTeraboxShareUrl(input: string): ParseTeraboxResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: 'Introduce el enlace compartido de Terabox.' }
  }

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return { ok: false, error: 'La URL no es válida.' }
  }

  const host = u.hostname.toLowerCase()
  const allowed =
    host === '1024terabox.com' ||
    host === 'www.1024terabox.com' ||
    host === 'terabox.com' ||
    host === 'www.terabox.com' ||
    host.endsWith('.terabox.com') ||
    host.endsWith('.1024terabox.com')

  if (!allowed) {
    return { ok: false, error: 'El enlace debe ser de Terabox (p. ej. 1024terabox.com).' }
  }

  if (!u.pathname.includes('/s/')) {
    return {
      ok: false,
      error: 'Se necesita un enlace de recurso compartido (la ruta contiene /s/…).',
    }
  }

  return { ok: true, url: trimmed }
}
