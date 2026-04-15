/**
 * Carpetas de separación en MEGA cuyo nombre incluye tres guiones seguidos (`---`), p. ej.
 * `001. ---All Winners Squad - 1946`. No deben mostrarse en el explorador.
 */
export function isMegaSeparatorPlaceholderFolder(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.trim()
  // Evita falsos positivos: solo se considera separador si empieza con prefijo numérico + punto + '---'
  // o directamente por '---'.
  return /^(\d{1,3}\.\s*)?---/.test(n)
}
