export type ParseMegaResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export function parseMegaFolderUrl(input: string): ParseMegaResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: 'Introduce el enlace de la carpeta de MEGA.' }
  }

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return { ok: false, error: 'La URL no es válida.' }
  }

  const host = u.hostname.toLowerCase()
  if (host !== 'mega.nz' && host !== 'mega.co.nz') {
    return { ok: false, error: 'El host debe ser mega.nz (o mega.co.nz).' }
  }

  if (!u.pathname.includes('/folder/')) {
    return {
      ok: false,
      error: 'Se necesita un enlace de carpeta (contiene /folder/…).',
    }
  }

  if (!u.hash || u.hash.length < 2) {
    return {
      ok: false,
      error: 'Falta la clave de la carpeta (la parte del enlace después de #).',
    }
  }

  return { ok: true, url: trimmed }
}
