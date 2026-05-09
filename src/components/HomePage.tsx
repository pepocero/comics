import { useEffect, useState } from 'react'

type Props = {
  onGoSources: () => void
  onGoLibrary: () => void
  libraryReady: boolean
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isAppAlreadyInstalled(): boolean {
  const standaloneByMedia = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standaloneByMedia || iosStandalone
}

export function HomePage({ onGoSources, onGoLibrary, libraryReady }: Props) {
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [installStatus, setInstallStatus] = useState('')
  const [showInstalledModal, setShowInstalledModal] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault()
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent)
      setInstallStatus('')
    }

    const onAppInstalled = (): void => {
      setDeferredInstallPrompt(null)
      setInstallStatus('Aplicacion instalada correctamente.')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const handleInstallApp = async (): Promise<void> => {
    if (isAppAlreadyInstalled()) {
      setShowInstalledModal(true)
      return
    }

    if (!deferredInstallPrompt) {
      setInstallStatus('La instalacion guiada no esta disponible en este navegador.')
      return
    }
    await deferredInstallPrompt.prompt()
    const choice = await deferredInstallPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstallStatus('Instalando aplicacion en tu telefono...')
    } else {
      setInstallStatus('Instalacion cancelada. Puedes intentarlo de nuevo cuando quieras.')
    }
    setDeferredInstallPrompt(null)
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <img
          className="home-logo"
          src="/logo.png"
          alt="ComicRead"
          width={320}
          height={120}
          decoding="async"
        />
      </header>

      <article className="home-doc">
        <h2 className="home-doc-title">Cómo funciona</h2>
        <button type="button" className="home-install-cta" onClick={handleInstallApp}>
          Instalar app en tu telefono
        </button>
        {installStatus ? <p className="home-install-status">{installStatus}</p> : null}
        {showInstalledModal ? (
          <div
            className="cr-modal-backdrop"
            role="presentation"
            onClick={() => setShowInstalledModal(false)}
          >
            <div
              className="cr-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Aplicación ya instalada"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="cr-modal-message">La app ya esta instalada en este dispositivo.</p>
              <div className="cr-modal-actions">
                <button
                  type="button"
                  className="home-install-cta"
                  onClick={() => setShowInstalledModal(false)}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="home-doc-block" aria-labelledby="home-fuentes">
          <h3 id="home-fuentes" className="home-doc-h3">
            Fuentes
          </h3>
          <p>
            La app incluye hasta 6 fuentes predeterminadas (carpetas de MEGA con colecciones de cómics).
            También puedes añadir cualquier carpeta compartida de MEGA.
          </p>
          <p>
            <strong>El sistema:</strong>
          </p>
          <ul className="home-doc-list">
            <li>Lee carpetas y subcarpetas automáticamente</li>
            <li>Detecta archivos .cbz y .cbr</li>
            <li>Muestra el contenido listo para navegar</li>
          </ul>
          <p>Solo tienes que añadir el enlace y pulsar «Abrir esta carpeta».</p>
        </section>

        <section className="home-doc-block" aria-labelledby="home-biblio">
          <h3 id="home-biblio" className="home-doc-h3">
            Biblioteca MEGA
          </h3>
          <p>Navega por tus carpetas como lo harías en MEGA:</p>
          <ul className="home-doc-list">
            <li>Las carpetas principales se muestran como tarjetas</li>
            <li>Al entrar, verás el listado de archivos</li>
            <li>Pulsa sobre un cómic para descargarlo y leerlo</li>
          </ul>
        </section>

        <section className="home-doc-block" aria-labelledby="home-descargas">
          <h3 id="home-descargas" className="home-doc-h3">
            Descargas y lectura
          </h3>
          <p>Los cómics descargados se almacenan en tu dispositivo:</p>
          <ul className="home-doc-list">
            <li>Accede a ellos desde Descargas o la biblioteca</li>
            <li>Continúa donde lo dejaste con Seguir leyendo</li>
            <li>Puedes tener varios cómics en curso</li>
          </ul>
          <p>
            Ten en cuenta que los archivos CBR y CBZ ya están comprimidos, por lo que primero se
            descargan en caché antes de abrirse.
          </p>
          <p>
            <strong>Si necesitas espacio:</strong>
          </p>
          <ul className="home-doc-list">
            <li>Borra archivos individuales desde Configuración</li>
            <li>O limpia toda la caché para liberar almacenamiento</li>
          </ul>
        </section>

        <section className="home-doc-block" aria-labelledby="home-fav">
          <h3 id="home-fav" className="home-doc-h3">
            Favoritos
          </h3>
          <p>
            Marca cualquier cómic como favorito usando la estrella. Así podrás crear tu propia
            colección y descargarla cuando quieras.
          </p>
        </section>

        <section className="home-doc-block" aria-labelledby="home-visor">
          <h3 id="home-visor" className="home-doc-h3">
            Visor
          </h3>
          <p>El visor está optimizado para lectura cómoda:</p>
          <ul className="home-doc-list">
            <li>Botón para mejorar la imagen</li>
            <li>Índice de páginas accesible</li>
            <li>Zoom con doble toque (móvil), con niveles progresivos</li>
          </ul>
        </section>
      </article>

      <div className="home-actions">
        <button type="button" className="home-cta" onClick={onGoSources}>
          Elegir fuentes MEGA
        </button>
        {libraryReady ? (
          <button type="button" className="home-cta home-cta--secondary" onClick={onGoLibrary}>
            Ir a la biblioteca
          </button>
        ) : null}
      </div>
    </div>
  )
}
