import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Guides } from './Guides'
import '../tokens.css'
import '../landing/landing.css'
import './guides.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guides />
  </StrictMode>,
)
