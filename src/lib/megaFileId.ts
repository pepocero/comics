import type { File as MegaFile } from 'megajs'

export function megaFileCacheId(file: MegaFile): string {
  if (file.nodeId) return file.nodeId
  return JSON.stringify(file.downloadId)
}
