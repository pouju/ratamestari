import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageRoot } from '../i18n/language-root'
import type { Messages } from '../i18n'
import { Landing } from './Landing'
import '../tokens.css'
import './landing.css'

const pageTitle = (messages: Messages) => messages.landing.pageTitle

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageRoot title={pageTitle}>
      <Landing />
    </LanguageRoot>
  </StrictMode>,
)
