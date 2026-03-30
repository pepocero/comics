import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { File as MegaFile } from 'megajs'
import { megaFileCacheId } from '../lib/megaFileId'
import { getMegaSourceSlotForPortada } from '../config/megaSettings'
import {
  MEGA_FOLDER_GENERIC_COVER,
  localPortadaUrlCandidates,
} from '../lib/localMegaPortada'

type Props = {
  /** URL MEGA de la cuenta/carpeta raíz abierta; determina si usar url1, url2, … */
  megaFolderUrl: string
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

function probeImageLoads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

export function MegaRootFolderCards({
  megaFolderUrl,
  folders,
  disabled,
  onOpenFolder,
}: Props) {
  const sourceSlot = useMemo(
    () => getMegaSourceSlotForPortada(megaFolderUrl),
    [megaFolderUrl],
  )

  const folderKey = useMemo(
    () => folders.map((f) => megaFileCacheId(f)).join('|'),
    [folders],
  )

  const [displayUrlById, setDisplayUrlById] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const next: Record<string, string> = {}

      for (const f of folders) {
        const id = megaFileCacheId(f)
        const candidates = localPortadaUrlCandidates(f.name, sourceSlot)

        if (candidates.length === 0) {
          next[id] = MEGA_FOLDER_GENERIC_COVER
          continue
        }

        let chosen = MEGA_FOLDER_GENERIC_COVER
        for (const url of candidates) {
          if (cancelled) return
          // eslint-disable-next-line no-await-in-loop -- orden fijo de extensiones
          if (await probeImageLoads(url)) {
            chosen = url
            break
          }
        }
        next[id] = chosen
      }

      if (!cancelled) {
        setDisplayUrlById(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [folders, folderKey, sourceSlot])

  return (
    <ul className="mega-root-grid" aria-label="Carpetas en la raíz">
      {folders.map((f) => {
        const label = f.name || '(sin nombre)'
        const hue = hueFromString(label)
        const id = megaFileCacheId(f)
        const resolved = displayUrlById[id] ?? MEGA_FOLDER_GENERIC_COVER

        const style = {
          ['--mega-card-hue']: String(hue),
          backgroundImage: `url(${JSON.stringify(resolved)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } as CSSProperties

        return (
          <li key={id}>
            <button
              type="button"
              className="mega-folder-card mega-folder-card--cover"
              onClick={() => onOpenFolder(f)}
              disabled={disabled}
              style={style}
              aria-label={label}
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
