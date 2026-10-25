import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { LANGUAGES, LanguageProvider, type LanguageCode, type Messages } from '.'

const LANGUAGE_STORAGE_KEY = 'ratamestari.language'

export const isLanguageCode = (code: string | null): code is LanguageCode =>
  code !== null && Object.hasOwn(LANGUAGES, code)

// The language chosen before in this browser, else Finnish for a Finnish browser, else English.
function initialLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (isLanguageCode(stored)) return stored
  } catch {
    // Without storage the browser's language decides.
  }
  const preferred = typeof navigator === 'undefined' ? [] : navigator.languages
  return preferred.some(locale => locale.toLowerCase().startsWith('fi')) ? 'fi' : 'en'
}

interface LanguageChoice {
  readonly code: LanguageCode
  readonly choose: (code: LanguageCode) => void
}

const LanguageChoiceContext = createContext<LanguageChoice>({ code: 'en', choose: () => {} })

export const useLanguageChoice = (): LanguageChoice => useContext(LanguageChoiceContext)

// Picks the language for a page, remembers a change, and keeps the page's lang and title in step.
export function LanguageRoot({
  title,
  children,
}: {
  title: (messages: Messages) => string
  children: ReactNode
}) {
  const [code, setCode] = useState(initialLanguage)
  const language = LANGUAGES[code]

  useEffect(() => {
    document.documentElement.lang = language.locale
    document.title = title(language.messages)
  }, [language, title])

  const choose = (next: LanguageCode) => {
    setCode(next)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      // The choice then lasts until the page is reloaded.
    }
  }

  return (
    <LanguageChoiceContext.Provider value={{ code, choose }}>
      <LanguageProvider value={language}>{children}</LanguageProvider>
    </LanguageChoiceContext.Provider>
  )
}

// A link to the other language, written in that language.
export function LanguageSwitch({ className }: { className?: string }) {
  const { code, choose } = useLanguageChoice()
  const other: LanguageCode = code === 'fi' ? 'en' : 'fi'
  return (
    <button
      type="button"
      className={className}
      lang={LANGUAGES[other].locale}
      onClick={() => choose(other)}
    >
      {LANGUAGES[code].messages.language.switchTo}
    </button>
  )
}
