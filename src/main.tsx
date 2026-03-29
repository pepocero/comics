import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initThemeFromStorage } from './lib/appTheme'
import './theme-tokens.css'
import './index.css'
import App from './App.tsx'

initThemeFromStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
