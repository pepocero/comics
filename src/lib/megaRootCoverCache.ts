import type { MegaSourceSlot } from '../config/megaSettings'

const MAX_ENTRIES = 5000
const resolvedByKey = new Map<string, string>()

export function makeMegaRootCoverCacheKey(
  megaFolderUrl: string,
  sourceSlot: MegaSourceSlot | null,
  folderStableId: string,
): string {
  const u = megaFolderUrl.trim()
  const s = sourceSlot === null ? '-' : String(sourceSlot)
  return `${s}|${u}|${folderStableId}`
}

export function hasMegaRootCoverCache(key: string): boolean {
  return resolvedByKey.has(key)
}

export function getMegaRootCoverCache(key: string): string | undefined {
  return resolvedByKey.get(key)
}

export function setMegaRootCoverCache(key: string, url: string): void {
  if (resolvedByKey.size >= MAX_ENTRIES && !resolvedByKey.has(key)) {
    const first = resolvedByKey.keys().next().value
    if (first !== undefined) resolvedByKey.delete(first)
  }
  resolvedByKey.set(key, url)
}

/** Ejecuta tareas con un máximo de `concurrency` en vuelo a la vez. */
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  const c = Math.min(Math.max(1, concurrency), items.length)
  let next = 0
  async function runWorker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) break
      await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: c }, () => runWorker()))
}
