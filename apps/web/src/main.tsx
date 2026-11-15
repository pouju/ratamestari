import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageRoot } from './i18n/language-root'
import { App } from './App'
import './tokens.css'
import './styles.css'

const pageTitle = () => 'Ratamestari'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageRoot title={pageTitle}>
      <App />
    </LanguageRoot>
  </StrictMode>,
)
