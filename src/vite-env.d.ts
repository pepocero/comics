/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string
declare const __BUILD_ID__: string
/** Inyectado en build desde `vite.config.ts` a partir de `VITE_MEGA_FOLDER_URL_<n>`. */
declare const __COMICREAD_MEGA_SOURCES__: readonly {
  readonly n: number
  readonly url: string
  readonly label: string
}[]

interface ImportMetaEnv {
  /** Compatibilidad: una sola URL si no usas claves numeradas */
  readonly VITE_MEGA_FOLDER_URL?: string
  /** Añade tantas como necesites: `VITE_MEGA_FOLDER_URL_1` … `_9` … (n ≥ 1). */
  readonly [key: string]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
