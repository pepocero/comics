/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string
declare const __BUILD_ID__: string

interface ImportMetaEnv {
  /** Compatibilidad: una sola URL si no usas _1 … _5 */
  readonly VITE_MEGA_FOLDER_URL?: string
  readonly VITE_MEGA_FOLDER_URL_1?: string
  readonly VITE_MEGA_FOLDER_URL_2?: string
  readonly VITE_MEGA_FOLDER_URL_3?: string
  readonly VITE_MEGA_FOLDER_URL_4?: string
  readonly VITE_MEGA_FOLDER_URL_5?: string
  readonly VITE_MEGA_SOURCE_LABEL_1?: string
  readonly VITE_MEGA_SOURCE_LABEL_2?: string
  readonly VITE_MEGA_SOURCE_LABEL_3?: string
  readonly VITE_MEGA_SOURCE_LABEL_4?: string
  readonly VITE_MEGA_SOURCE_LABEL_5?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
