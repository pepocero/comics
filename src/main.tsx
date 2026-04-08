import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initThemeFromStorage } from './lib/appTheme'
import './theme-tokens.css'
import './index.css'
import App from './App.tsx'

/**
 * Tras un despliegue, un tab antiguo puede intentar cargar chunks con hash viejo.
 * Vite emite `vite:preloadError`; recargar trae el nuevo index+assets.
 */
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

initThemeFromStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
