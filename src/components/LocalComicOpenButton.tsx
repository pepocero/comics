import { useRef, useState } from 'react'
import { extractComicPages } from '../lib/comicArchive'
import type { ViewerPage } from './ComicViewer'

function isAllowedComicFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.endsWith('.cbz') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.cbr') ||
    lower.endsWith('.rar')
  )
}

export type LocalComicOpenPayload = {
  title: string
  pages: ViewerPage[]
  archiveBuffer: ArrayBuffer
  archiveFileName: string
}

type Props = {
  onOpen: (payload: LocalComicOpenPayload) => void
  disabled?: boolean
  /** selector de fuente (tarjeta grande) o barra del navegador */
  variant: 'panel' | 'header'
}

export function LocalComicOpenButton({ onOpen, disabled, variant }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!isAllowedComicFile(file.name)) {
      setError('Usa .cbz, .zip, .cbr o .rar con imágenes.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      const extracted = await extractComicPages(buffer, file.name)
      if (extracted.length === 0) {
        setError('No se encontraron imágenes en el archivo.')
        return
      }
      const pages: ViewerPage[] = extracted.map((p) => ({
        name: p.name,
        url: URL.createObjectURL(p.blob),
      }))
      const title = file.name.replace(/\.[^.]+$/, '') || file.name
      onOpen({
        title,
        pages,
        archiveBuffer: buffer,
        archiveFileName: file.name,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el archivo.')
    } finally {
      setBusy(false)
    }
  }

  const panel = variant === 'panel'

  return (
    <div className={`local-comic-open${panel ? ' local-comic-open--panel' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept=".cbz,.zip,.cbr,.rar,application/zip,application/x-rar-compressed"
        className="local-comic-open-input"
        onChange={(e) => void handleChange(e)}
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        className={
          panel
            ? 'source-card local-comic-open-btn'
            : 'btn-secondary local-comic-open-btn--header'
        }
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Abriendo…' : panel ? '📂 Archivo en el dispositivo' : 'Archivo local'}
      </button>
      {error ? <p className="error-msg local-comic-open-err">{error}</p> : null}
      {panel ? (
        <p className="muted local-comic-open-hint">
          Elige un .cbz / .zip / .cbr / .rar desde tu equipo o móvil. No se sube a ningún servidor.
        </p>
      ) : null}
    </div>
  )
}
