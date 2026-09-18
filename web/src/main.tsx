import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/kalam/400.css'
import '@fontsource/kalam/700.css'
import './theme.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
