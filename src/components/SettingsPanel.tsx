import { useState, type FormEvent } from 'react'
import { parseMegaFolderUrl } from '../lib/parseMegaFolderUrl'
import {
  getManualMegaFolderUrl,
  hasEnvMegaSources,
  setMegaFolderUrl,
} from '../config/megaSettings'
import { AppVersionFooter } from './AppVersionFooter'

type Props = {
  onSaved: () => void
  onCancel?: () => void
}

export function SettingsPanel({ onSaved, onCancel }: Props) {
  const fromEnv = hasEnvMegaSources()
  const [value, setValue] = useState(() => (fromEnv ? '' : getManualMegaFolderUrl()))
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    const parsed = parseMegaFolderUrl(value)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    setMegaFolderUrl(parsed.url)
    onSaved()
  }

  function handleClear(): void {
    setValue('')
    setMegaFolderUrl('')
    setError(null)
    onSaved()
  }

  if (fromEnv) {
    return (
      <section className="panel settings-panel">
        <h1>ComicRead</h1>
        <p className="lead">
          Las carpetas MEGA están definidas en variables de entorno (
          <code>VITE_MEGA_FOLDER_URL_1</code>, <code>_2</code>, <code>_3</code>). En local,
          cópialas en <code>.env</code>: cada URL debe ir <strong>entre comillas</strong> porque el{' '}
          <code>#</code> de la clave MEGA se pierde si no (el parser lo toma como comentario).
          En Cloudflare Pages, pega el enlace completo en el valor de la variable.
        </p>
        <p className="lead">
          Para cambiar de cuenta usa el botón <strong>Cambiar fuente</strong> en la cabecera
          del listado de archivos.
        </p>
        <div className="btn-row">
          {onCancel ? (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Volver
            </button>
          ) : null}
        </div>
        <p className="warn">
          Las descargas pueden consumir muchos datos y espacio en el dispositivo. Los cómics se
          guardan en caché local del navegador (IndexedDB).
        </p>
        <AppVersionFooter />
      </section>
    )
  }

  return (
    <section className="panel settings-panel">
      <h1>ComicRead</h1>
      <p className="lead">
        Pega el enlace completo de la carpeta de MEGA (incluye la parte después <code>#</code>).
        También puedes definir <code>VITE_MEGA_FOLDER_URL_1</code> … <code>_3</code> en{' '}
        <code>.env</code> o en Cloudflare Pages.
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="mega-url">Enlace de carpeta MEGA</label>
        <textarea
          id="mega-url"
          className="mega-url-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          placeholder="https://mega.nz/folder/…#…"
          rows={3}
          autoComplete="off"
          spellCheck={false}
        />
        {error ? <p className="error-msg">{error}</p> : null}
        <div className="btn-row">
          <button type="submit">Guardar y conectar</button>
          {onCancel ? (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancelar
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={handleClear}>
            Borrar guardado
          </button>
        </div>
      </form>
      <p className="warn">
        Las descargas pueden consumir muchos datos y espacio en el dispositivo. Los cómics se
        guardan en caché local del navegador (IndexedDB).
      </p>
      <AppVersionFooter />
    </section>
  )
}
