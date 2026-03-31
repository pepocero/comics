type Props = {
  onGoSources: () => void
  onGoLibrary: () => void
  libraryReady: boolean
}

export function HomePage({ onGoSources, onGoLibrary, libraryReady }: Props) {
  return (
    <div className="home-page">
      <header className="home-hero">
        <p className="home-eyebrow">Lector de cómics en el navegador</p>
        <h1 className="home-title">ComicRead</h1>
        <p className="home-lead">
          Lee archivos <strong>.cbz</strong>, <strong>.cbr</strong>, <strong>.zip</strong> y{' '}
          <strong>.rar</strong> guardados en tu nube MEGA, con descarga en caché en este dispositivo para
          leer sin volver a bajar el archivo. También puedes abrir un cómic desde archivos locales.
        </p>
      </header>

      <section className="home-section" aria-labelledby="how-heading">
        <h2 id="how-heading" className="home-h2">
          Cómo funciona
        </h2>
        <ol className="home-steps">
          <li>
            <span className="home-step-num">1</span>
            <div>
              <strong>Fuentes</strong>
              <p>
                Elige la cuenta MEGA configurada en la app (hasta cinco enlaces en el entorno de
                compilación). Si solo hay una, se usa automáticamente al entrar en la biblioteca.
              </p>
            </div>
          </li>
          <li>
            <span className="home-step-num">2</span>
            <div>
              <strong>Biblioteca MEGA</strong>
              <p>
                Navega por las carpetas como en MEGA. En la raíz verás cada saga o carpeta como una
                tarjeta; al entrar, el listado es el habitual. Toca un archivo de cómic para
                descargarlo al dispositivo.
              </p>
            </div>
          </li>
          <li>
            <span className="home-step-num">3</span>
            <div>
              <strong>Descargas y lectura</strong>
              <p>
                Los archivos descargados aparecen en <strong>Descargas</strong>. Ábrelos desde ahí o
                desde la biblioteca. El progreso se guarda en <strong>Seguir leyendo</strong>: puedes
                tener varios cómics en curso y retomar el que quieras.
              </p>
            </div>
          </li>
        </ol>
      </section>

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

      <p className="home-note muted">
        Los ajustes de enlace MEGA manual siguen disponibles desde el icono de ajustes dentro de la
        biblioteca cuando no hay URLs predefinidas en el entorno.
      </p>
    </div>
  )
}
