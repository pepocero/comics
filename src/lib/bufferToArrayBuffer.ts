/** Convierte Uint8Array de megajs a ArrayBuffer independiente. */
export function toArrayBuffer(buf: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(buf.byteLength)
  copy.set(buf)
  return copy.buffer
}
