const LS_KEY = 'comicread_rotation_lock_v1'

/** La API de bloqueo no está en todas las versiones de `lib.dom`. */
type ScreenOrientationLockable = {
  type: string
  lock: (orientation: 'portrait' | 'landscape') => Promise<void>
  unlock?: () => void
}

function screenOrientationOrNull(): ScreenOrientationLockable | null {
  const o = window.screen?.orientation as unknown as ScreenOrientationLockable | undefined
  if (!o || typeof o.lock !== 'function') return null
  return o
}

export function supportsScreenOrientationLock(): boolean {
  try {
    if (typeof window === 'undefined') return false
    return screenOrientationOrNull() != null
  } catch {
    return false
  }
}

export function loadRotationLockPreference(): boolean {
  try {
    return window.localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

export function saveRotationLockPreference(locked: boolean): void {
  try {
    if (locked) window.localStorage.setItem(LS_KEY, '1')
    else window.localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

/** Bloquea en vertical u horizontal según la orientación actual del dispositivo. */
function broadLockType(): 'portrait' | 'landscape' {
  const t = window.screen?.orientation?.type ?? ''
  if (t.startsWith('portrait')) return 'portrait'
  if (t.startsWith('landscape')) return 'landscape'
  return window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape'
}

async function requestFullscreenPreferred(el: HTMLElement): Promise<void> {
  const req = el.requestFullscreen?.bind(el)
  if (req) {
    await req()
    return
  }
  const wk = (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen
  if (wk) {
    wk.call(el)
    return
  }
  throw new Error('fullscreen no disponible')
}

async function exitFullscreenPreferred(): Promise<void> {
  const doc = document as Document & { webkitExitFullscreen?: () => void }
  if (!document.fullscreenElement) return
  if (document.exitFullscreen) {
    await document.exitFullscreen()
    return
  }
  doc.webkitExitFullscreen?.()
}

export type RotationLockResult =
  | { ok: true; usedFullscreen: boolean }
  | { ok: false; message: string }

/**
 * Bloquea la rotación respecto a la orientación actual (retrato o apaisado).
 * En muchos navegadores móviles el bloqueo solo funciona tras `requestFullscreen` o como PWA instalada.
 */
export async function requestRotationLock(hostEl: HTMLElement | null): Promise<RotationLockResult> {
  const so = screenOrientationOrNull()
  if (!so) {
    return {
      ok: false,
      message:
        'Tu navegador no permite bloquear la orientación desde la página. Usa el bloqueo de rotación del sistema si lo tienes.',
    }
  }

  const mode = broadLockType()
  const tryLock = (): Promise<void> => so.lock(mode)

  try {
    await tryLock()
    return { ok: true, usedFullscreen: false }
  } catch {
    if (!hostEl) {
      return {
        ok: false,
        message:
          'No se pudo bloquear la rotación. Prueba con la app instalada en el teléfono o el bloqueo de orientación del sistema.',
      }
    }
    if (document.fullscreenElement && document.fullscreenElement !== hostEl) {
      return {
        ok: false,
        message:
          'Hay otra vista a pantalla completa; sal de ella e inténtalo de nuevo, o usa el bloqueo de rotación del sistema.',
      }
    }
    if (document.fullscreenElement === hostEl) {
      return {
        ok: false,
        message:
          'No se pudo fijar la orientación. Prueba el bloqueo de rotación del sistema o otro navegador.',
      }
    }

    try {
      await requestFullscreenPreferred(hostEl)
    } catch {
      return {
        ok: false,
        message:
          'No se pudo entrar en pantalla completa para bloquear la orientación. Instala la app o usa el bloqueo del sistema.',
      }
    }

    try {
      await tryLock()
      return { ok: true, usedFullscreen: true }
    } catch {
      try {
        await exitFullscreenPreferred()
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        message:
          'No se pudo bloquear la rotación. En algunos dispositivos solo funciona el bloqueo de orientación del sistema.',
      }
    }
  }
}

export function releaseRotationLock(): void {
  try {
    screenOrientationOrNull()?.unlock?.()
  } catch {
    /* ignore */
  }
}
