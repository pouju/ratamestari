import type { LocalPoint } from '@ratamestari/core'
import type { EventPlan } from '@ratamestari/engine'
import type { CourseSetting } from './engine.worker'
import type { CourseSnapshot } from './event-workspace'

// The event set on a map, kept in this browser so a reload loses nothing (D27). Nothing leaves
// the computer (D3).
export interface SavedEvent {
  readonly version: typeof SAVED_EVENT_VERSION
  readonly event: EventPlan
  readonly selectedCourseId: string
  readonly courses: Readonly<Record<string, CourseSnapshot>>
  readonly settings: Readonly<Record<string, CourseSetting>>
  readonly competitionCentre: LocalPoint | null
  readonly paceText: string
}

// Raise when the shape changes; events saved in an older shape are then not opened.
export const SAVED_EVENT_VERSION = 1

const DATABASE = 'ratamestari'
const STORE = 'events'

export function isOpenableEvent(value: unknown): value is SavedEvent {
  if (typeof value !== 'object' || value === null) return false
  const saved = value as Partial<SavedEvent>
  if (saved.version !== SAVED_EVENT_VERSION || !saved.event || !saved.courses) return false
  const ids = saved.event.courses.map(entry => entry.id)
  return (
    saved.selectedCourseId !== undefined &&
    ids.includes(saved.selectedCourseId) &&
    ids.every(id => id in saved.courses!)
  )
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function inStore<T>(
  mode: IDBTransactionMode,
  use: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = use(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

// Private windows and blocked storage just mean the event isn't kept.
export async function loadSavedEvent(mapKey: string): Promise<SavedEvent | null> {
  try {
    const saved: unknown = await inStore('readonly', store => store.get(mapKey))
    return isOpenableEvent(saved) ? saved : null
  } catch {
    return null
  }
}

export async function saveEvent(mapKey: string, saved: SavedEvent): Promise<void> {
  try {
    await inStore('readwrite', store => store.put(saved, mapKey))
  } catch {
    // Not kept; the workspace works on.
  }
}
