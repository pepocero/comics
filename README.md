# ComicRead

PWA para listar una carpeta compartida de MEGA, descargar cómics y leerlos en el navegador. Formatos: **.cbz** / **.zip** (ZIP) y **.cbr** / **.rar** (RAR mediante [libarchive.js](https://www.npmjs.com/package/libarchive.js)). Los RAR en varios volúmenes o con contraseña pueden fallar.

## Requisitos

- Node.js 20+
- Enlace de carpeta MEGA completo: `https://mega.nz/folder/HANDLE#CLAVE` (la clave va tras `#`).

## Configuración

1. Copia `.env.example` a `.env` (no se sube a Git).
2. **Varias fuentes:** define `VITE_MEGA_FOLDER_URL_1` … `VITE_MEGA_FOLDER_URL_8` (las que necesites). Para **MEGA**, usa el enlace completo de la carpeta (incluye la clave tras `#`). Para **Terabox** (p. ej. `1024terabox.com`), usa el enlace compartido público (`/s/…`). **En `.env`, pon cada URL entre comillas dobles** (`"https://…"`), porque si no el `#` de MEGA se interpreta como comentario. Opcional: `VITE_MEGA_SOURCE_LABEL_1` … `_8` para nombres en el selector.
3. **Terabox:** la lista de archivos se obtiene vía un resolver JSON (por defecto `POST /api/terabox-proxy`, proxy en desarrollo y [Cloudflare Pages Function](functions/api/terabox-proxy.ts) en el mismo sitio). Si falla por CORS o bloqueos, configura `VITE_TERABOX_RESOLVER_URL` con la URL completa de un resolver compatible (POST `{ "url": "<enlace>" }` → `{ ok, mapped: [{ name, size, dlink }] }`).
4. Al iniciar, si hay más de una fuente en el entorno, podrás elegir cuenta. La elección se guarda en `localStorage`.
5. **Sin `.env`:** puedes pegar un único enlace en la pantalla inicial (solo `localStorage`).
6. **Compatibilidad:** `VITE_MEGA_FOLDER_URL` (una sola URL) sigue funcionando si no usas `_1` … `_8`.

En el hosting, configura las mismas variables `VITE_*` que en el entorno de build y vuelve a desplegar si las cambias.

## Desarrollo

```bash
npm install
npm run dev
```

## Producción

```bash
npm run build
npm run preview
```

Servir `dist/` por HTTPS para que la PWA y el service worker funcionen correctamente.

## Instalación como PWA

En el navegador móvil o de escritorio, usa “Instalar aplicación” / “Añadir a pantalla de inicio” cuando el navegador lo ofrezca.

## Nota legal

Usa [megajs](https://github.com/qgustavor/mega) de acuerdo con los [términos de MEGA](https://mega.nz/terms).
