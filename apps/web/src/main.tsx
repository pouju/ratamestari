import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageRoot } from './i18n/language-root'
import type { Messages } from './i18n'
import { App } from './App'
import './tokens.css'
import './styles.css'

const pageTitle = (_: Messages) => 'Ratamestari'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageRoot title={pageTitle}>
      <App />
    </LanguageRoot>
  </StrictMode>,
)
