import { useRef, useSyncExternalStore } from 'react'

// Experimental features (D24) are on while developing and off in the published app until turned
// on by clicking the version in Settings a few times in quick succession. The choice is stored in
// this browser only.
const STORAGE_KEY = 'ratamestari.experimentalFeatures'
const UNLOCK_CLICKS = 7
const UNLOCK_WINDOW_MS = 3000

function storedChoice(): boolean | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'on' ? true : stored === 'off' ? false : null
  } catch {
    return null
  }
}

let enabled = storedChoice() ?? import.meta.env.DEV
const listeners = new Set<() => void>()

export function setExperimentalFeatures(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Private windows may refuse storage; the choice then lasts until the page closes.
  }
  for (const listener of listeners) listener()
}

export function useExperimentalFeatures(): boolean {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => enabled,
    () => enabled,
  )
}

// Returns a click handler; after enough quick clicks it switches the features and returns the
// new state, otherwise null.
export function unlockClickCounter(now: () => number = () => performance.now()) {
  let clicks: number[] = []
  return (): boolean | null => {
    const time = now()
    clicks = [...clicks.filter(earlier => time - earlier < UNLOCK_WINDOW_MS), time]
    if (clicks.length < UNLOCK_CLICKS) return null
    clicks = []
    setExperimentalFeatures(!enabled)
    return enabled
  }
}

export function useUnlockClicks(): () => boolean | null {
  const counter = useRef<(() => boolean | null) | null>(null)
  counter.current ??= unlockClickCounter()
  return counter.current
}
