/** Id estable para caché / favoritos de un fichero dentro de un enlace Terabox compartido. */
function fnv1a32Hex(s: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h >>> 0).toString(16)
}

export function teraboxFileCacheId(shareUrl: string, fileName: string): string {
  return `tb_${fnv1a32Hex(`${shareUrl.trim()}\0${fileName}`)}`
}
