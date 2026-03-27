import type { MegaSource } from '../config/megaSettings'
import { setStoredSourceSlot } from '../config/megaSettings'
import { ContinueReadingSection } from './ContinueReadingSection'
import { LocalComicOpenButton, type LocalComicOpenPayload } from './LocalComicOpenButton'

type Props = {
  sources: MegaSource[]
  onSelect: () => void
  onOpenLocalComic: (payload: LocalComicOpenPayload) => void
  continueReadingHidden?: boolean
  onContinueReading: () => void | Promise<void>
  onForgetReading: () => void
  continueReadingBusy?: boolean
}

export function SourcePicker({
  sources,
  onSelect,
  onOpenLocalComic,
  continueReadingHidden,
  onContinueReading,
  onForgetReading,
  continueReadingBusy,
}: Props) {
  return (
    <section className="panel source-picker">
      <h1>ComicRead</h1>
      <p className="lead">
        Elige desde qué cuenta de MEGA quieres cargar los cómics, o abre un archivo desde tu dispositivo.
      </p>
      <ContinueReadingSection
        hidden={continueReadingHidden}
        onContinue={onContinueReading}
        onForget={onForgetReading}
        busy={continueReadingBusy}
      />
      <ul className="source-list">
        {sources.map((s) => (
          <li key={s.slot}>
            <button
              type="button"
              className="source-card"
              onClick={() => {
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
    </section>
  )
}
