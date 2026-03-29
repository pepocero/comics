const DB_NAME = 'comicread-cache'
const DB_VERSION = 2
const STORE = 'files'
const STORE_LOCAL_READING = 'localReading'

export interface LocalReadingBlobRecord {
  id: string
  fileName: string
  data: ArrayBuffer
}

export interface CachedComicRecord {
  id: string
  megaNodeId: string
  name: string
  size: number
  downloadedAt: number
  data: ArrayBuffer
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = (): void => {
      reject(req.error ?? new Error('IndexedDB error'))
    }
    req.onsuccess = (): void => {
      resolve(req.result)
    }
    req.onupgradeneeded = (ev: IDBVersionChangeEvent): void => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (ev.oldVersion < 2 && !db.objectStoreNames.contains(STORE_LOCAL_READING)) {
        db.createObjectStore(STORE_LOCAL_READING, { keyPath: 'id' })
      }
    }
  })
}

export async function getCachedComic(id: string): Promise<CachedComicRecord | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const st = tx.objectStore(STORE)
    const r = st.get(id)
    r.onerror = (): void => {
      reject(r.error ?? new Error('get failed'))
    }
    r.onsuccess = (): void => {
      resolve((r.result as CachedComicRecord | undefined) ?? null)
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

export async function putCachedComic(record: CachedComicRecord): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    const r = st.put(record)
    r.onerror = (): void => {
      reject(r.error ?? new Error('put failed'))
    }
    r.onsuccess = (): void => {
      resolve()
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

export async function deleteCachedComic(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    const r = st.delete(id)
    r.onerror = (): void => {
      reject(r.error ?? new Error('delete failed'))
    }
    r.onsuccess = (): void => {
      resolve()
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

export async function clearAllCachedComics(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const st = tx.objectStore(STORE)
    const r = st.clear()
    r.onerror = (): void => {
      reject(r.error ?? new Error('clear failed'))
    }
    r.onsuccess = (): void => {
      resolve()
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

export async function clearAllLocalReadingBlobs(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCAL_READING, 'readwrite')
    const st = tx.objectStore(STORE_LOCAL_READING)
    const r = st.clear()
    r.onerror = (): void => {
      reject(r.error ?? new Error('clear local reading failed'))
    }
    r.onsuccess = (): void => {
      resolve()
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

/** Comprueba que el registro guardado coincide con el tamaño esperado (descarga íntegra). */
export async function verifyCachedComicBytes(
  id: string,
  expectedByteLength: number,
): Promise<boolean> {
  const row = await getCachedComic(id)
  if (!row?.data) return false
  return row.data.byteLength === expectedByteLength
}

export async function listCachedComicMeta(): Promise<
  Omit<CachedComicRecord, 'data'>[]
> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const st = tx.objectStore(STORE)
    const r = st.getAll()
    r.onerror = (): void => {
      reject(r.error ?? new Error('getAll failed'))
    }
    r.onsuccess = (): void => {
      const rows = (r.result as CachedComicRecord[]).map(
        ({ id, megaNodeId, name, size, downloadedAt }) => ({
          id,
          megaNodeId,
          name,
          size,
          downloadedAt,
        }),
      )
      resolve(rows)
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

export function estimateCacheBytes(metas: { size: number }[]): number {
  return metas.reduce((a, m) => a + (Number(m.size) || 0), 0)
}

export async function putLocalReadingBlob(record: LocalReadingBlobRecord): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCAL_READING, 'readwrite')
    const st = tx.objectStore(STORE_LOCAL_READING)
    const r = st.put(record)
    r.onerror = (): void => {
      reject(r.error ?? new Error('put local reading failed'))
    }
    r.onsuccess = (): void => {
      resolve()
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

export async function getLocalReadingBlob(id: string): Promise<LocalReadingBlobRecord | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCAL_READING, 'readonly')
    const st = tx.objectStore(STORE_LOCAL_READING)
    const r = st.get(id)
    r.onerror = (): void => {
      reject(r.error ?? new Error('get local reading failed'))
    }
    r.onsuccess = (): void => {
      resolve((r.result as LocalReadingBlobRecord | undefined) ?? null)
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}

export async function deleteLocalReadingBlob(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOCAL_READING, 'readwrite')
    const st = tx.objectStore(STORE_LOCAL_READING)
    const r = st.delete(id)
    r.onerror = (): void => {
      reject(r.error ?? new Error('delete local reading failed'))
    }
    r.onsuccess = (): void => {
      resolve()
    }
    tx.oncomplete = (): void => {
      db.close()
    }
  })
}
