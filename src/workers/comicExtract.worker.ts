/// <reference lib="webworker" />

import { extractComicPages } from '../lib/comicArchive'

declare const self: DedicatedWorkerGlobalScope

self.addEventListener(
  'message',
  async (ev: MessageEvent<{ buffer: ArrayBuffer; filenameHint: string }>) => {
    const { buffer, filenameHint } = ev.data
    try {
      const pages = await extractComicPages(buffer, filenameHint)
      self.postMessage({ ok: true as const, pages })
    } catch (e) {
      self.postMessage({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  },
)
