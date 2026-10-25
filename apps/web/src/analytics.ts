// Visit counting with Umami on the published site (D23). Events say what was done, never with
// what: no map, file names, coordinates or course geometry.
interface AnalyticsEvents {
  readonly 'map-opened': { readonly map: 'sample' | 'own' }
  readonly 'course-set': {
    readonly map: 'sample' | 'own'
    readonly level: string
    readonly format: string
    readonly courseClass: string
    readonly keptControls: number
  }
  readonly 'set-by-hand-started': undefined
  readonly 'course-file-checked': undefined
  readonly 'pdf-downloaded': undefined
  readonly 'xml-downloaded': undefined
  readonly 'assistant-turned-on': undefined
  readonly 'assistant-asked': undefined
}

declare global {
  interface Window {
    // Defined by Umami's script, which only the published build loads.
    umami?: { track: (event: string, data?: Readonly<Record<string, string | number>>) => void }
  }
}

export function track<Event extends keyof AnalyticsEvents>(
  event: Event,
  ...data: AnalyticsEvents[Event] extends undefined ? [] : [AnalyticsEvents[Event]]
): void {
  if (typeof window !== 'undefined') window.umami?.track(event, data[0])
}
