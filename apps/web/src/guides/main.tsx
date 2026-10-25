import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageRoot } from '../i18n/language-root'
import type { Messages } from '../i18n'
import { Guides } from './Guides'
import '../tokens.css'
import '../landing/landing.css'
import './guides.css'

const pageTitle = (messages: Messages) => messages.guides.pageTitle

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageRoot title={pageTitle}>
      <Guides />
    </LanguageRoot>
  </StrictMode>,
)
