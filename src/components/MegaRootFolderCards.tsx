import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { File as MegaFile } from 'megajs'
import { coverUrlForFolderIndex, loadBibliotecaCoverUrls } from '../lib/bibliotecaCovers'
import { megaFileCacheId } from '../lib/megaFileId'

type Props = {
  folders: MegaFile[]
  disabled: boolean
  onOpenFolder: (folder: MegaFile) => void
}

function hueFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h % 360
}

export function MegaRootFolderCards({ folders, disabled, onOpenFolder }: Props) {
  const [coverUrls, setCoverUrls] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void loadBibliotecaCoverUrls().then((urls) => {
      if (!cancelled) setCoverUrls(urls)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ul className="mega-root-grid" aria-label="Carpetas en la raíz">
      {folders.map((f, folderIndex) => {
        const label = f.name || '(sin nombre)'
        const hue = hueFromString(label)
        const id = megaFileCacheId(f)
        const coverUrl = coverUrlForFolderIndex(coverUrls, folderIndex)
        const hasCover = typeof coverUrl === 'string' && coverUrl.length > 0

        const style = {
          ['--mega-card-hue']: String(hue),
          ...(hasCover
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(6,4,12,0.1) 0%, rgba(6,4,12,0.38) 50%, rgba(6,4,12,0.62) 100%), url(${JSON.stringify(coverUrl)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {}),
        } as CSSProperties

        return (
          <li key={id}>
            <button
              type="button"
              className={`mega-folder-card${hasCover ? ' mega-folder-card--cover' : ''}`}
              onClick={() => onOpenFolder(f)}
              disabled={disabled}
              style={style}
            >
              <span className="mega-folder-card-shine" aria-hidden />
              <span className="mega-folder-card-title">{label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
