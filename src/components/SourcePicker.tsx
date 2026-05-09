import { useState, type FormEvent } from 'react'
import type { MegaSource } from '../config/megaSettings'
import {
  setMegaFolderUrl,
  setStoredSourceSlot,
  setUseManualMegaUrl,
} from '../config/megaSettings'
import { parseMegaFolderUrl } from '../lib/parseMegaFolderUrl'
import { LocalComicOpenButton, type LocalComicOpenPayload } from './LocalComicOpenButton'

type Props = {
  sources: MegaSource[]
  onSelect: () => void
  onOpenLocalComic: (payload: LocalComicOpenPayload) => void
}

export function SourcePicker({ sources, onSelect, onOpenLocalComic }: Props) {
  const [pastedUrl, setPastedUrl] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  function handlePastedSubmit(e: FormEvent): void {
    e.preventDefault()
    const mega = parseMegaFolderUrl(pastedUrl)
    if (mega.ok) {
      setPasteError(null)
      setMegaFolderUrl(mega.url)
      setUseManualMegaUrl(true)
      onSelect()
      return
    }
    setPasteError(mega.error)
  }

  return (
    <section className="panel source-picker">
      <h1 className="source-picker-title">Fuentes de lectura</h1>
      <p className="lead source-picker-lead-box">
        Elige una de las fuentes de abajo: cada una enlaza a una carpeta de MEGA con una colección de
        cómics concreta. Al seleccionarla, verás su contenido en <strong>Biblioteca MEGA</strong>. Si
        sales y vuelves a entrar en esa sección, se seguirá usando la última fuente elegida hasta que
        cambies a otra.
      </p>
      <ul className="source-list">
        {sources.map((s) => (
          <li key={s.slot}>
            <button
              type="button"
              className="source-card"
              onClick={() => {
                setUseManualMegaUrl(false)
                setStoredSourceSlot(s.slot)
                onSelect()
              }}
            >
              <span className="source-card-label">{s.label}</span>
              {s.hasCustomLabel ? null : (
                <span className="source-card-hint">Cuenta {s.slot + 1}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <p className="source-picker-divider" role="presentation">
        o
      </p>
      <LocalComicOpenButton variant="panel" onOpen={onOpenLocalComic} />

      <p className="source-picker-divider" role="presentation">
        o
      </p>

      <form className="source-picker-paste" onSubmit={handlePastedSubmit}>
        <h2 className="source-picker-paste-title">Enlace MEGA</h2>
        <p className="source-picker-paste-lead muted">
          Pega el enlace completo de la carpeta (incluye la clave tras <code>#</code>). Se usará con
          prioridad sobre las fuentes de arriba hasta que elijas otra.
        </p>
        <label className="source-picker-paste-label" htmlFor="source-paste-mega-url">
          URL
        </label>
        <textarea
          id="source-paste-mega-url"
          className="mega-url-input"
          value={pastedUrl}
          onChange={(e) => {
            setPastedUrl(e.target.value)
            setPasteError(null)
          }}
          placeholder="https://mega.nz/folder/…#…"
          rows={3}
          autoComplete="off"
          spellCheck={false}
        />
        {pasteError ? <p className="error-msg">{pasteError}</p> : null}
        <div className="btn-row">
          <button type="submit">Abrir esta carpeta</button>
        </div>
      </form>
    </section>
  )
}
