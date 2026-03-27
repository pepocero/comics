# ComicRead

PWA para listar una carpeta compartida de MEGA, descargar cómics y leerlos en el navegador. Formatos: **.cbz** / **.zip** (ZIP) y **.cbr** / **.rar** (RAR mediante [libarchive.js](https://www.npmjs.com/package/libarchive.js)). Los RAR en varios volúmenes o con contraseña pueden fallar.

## Requisitos

- Node.js 20+
- Enlace de carpeta MEGA completo: `https://mega.nz/folder/HANDLE#CLAVE` (la clave va tras `#`).

## Configuración

1. Copia `.env.example` a `.env` (no se sube a Git).
2. **Tres cuentas / carpetas MEGA:** define `VITE_MEGA_FOLDER_URL_1`, `VITE_MEGA_FOLDER_URL_2` y `VITE_MEGA_FOLDER_URL_3` con el enlace completo de cada carpeta (incluye la clave tras `#`). **En `.env`, pon cada URL entre comillas dobles** (`"https://…#…"`), porque si no el `#` se interpreta como inicio de comentario y se pierde la clave. Opcional: `VITE_MEGA_SOURCE_LABEL_1` … `_3` para nombres en el selector.
3. Al iniciar, si hay más de una fuente en el entorno, podrás elegir cuenta. La elección se guarda en `localStorage`.
4. **Sin `.env`:** puedes pegar un único enlace en la pantalla inicial (solo `localStorage`).
5. **Compatibilidad:** `VITE_MEGA_FOLDER_URL` (una sola URL) sigue funcionando si no usas `_1` … `_3`.

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
