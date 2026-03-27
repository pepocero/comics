import { Archive } from 'libarchive.js'
import workerUrl from 'libarchive.js/dist/worker-bundle.js?url'

let initialized = false

/** Debe llamarse antes de abrir un .cbr; carga el worker de libarchive una sola vez. */
export function ensureLibarchiveInit(): void {
  if (initialized) return
  Archive.init({ workerUrl })
  initialized = true
}
