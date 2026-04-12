/**
 * Decodifica bytes de un .txt para mostrarlos en el navegador.
 * Listados de Windows o antiguos suelen ir en Windows-1252; leerlos como UTF-8 produce (U+FFFD)
 * donde había guiones largos, comillas tipográficas, etc.
 */
export function decodeTextFileForDisplay(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length === 0) return ''

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }

  const utf8Loose = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (!utf8Loose.includes('\uFFFD')) return utf8Loose

  try {
    const win = new TextDecoder('windows-1252').decode(bytes)
    if (!win.includes('\uFFFD')) return win
  } catch {
    /* `windows-1252` no disponible en algunos entornos */
  }

  return new TextDecoder('iso-8859-1').decode(bytes)
}
