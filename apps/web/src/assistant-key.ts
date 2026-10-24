import { useState } from 'react'

const API_KEY_STORAGE_KEY = 'ratamestari.anthropicApiKey'

function readStoredKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function storeKey(apiKey: string | null) {
  try {
    if (apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
    else localStorage.removeItem(API_KEY_STORAGE_KEY)
  } catch {
    // Without storage the key lives only until the page is reloaded.
  }
}

export interface AssistantKey {
  readonly apiKey: string
  readonly save: (apiKey: string) => void
  readonly forget: () => void
}

export function useAssistantKey(): AssistantKey {
  const [apiKey, setApiKey] = useState(readStoredKey)
  return {
    apiKey,
    save: next => {
      storeKey(next)
      setApiKey(next)
    },
    forget: () => {
      storeKey(null)
      setApiKey('')
    },
  }
}
