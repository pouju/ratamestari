export type SearchPhase = 'areas' | 'skeleton' | 'sections' | 'improving' | 'checking'

export interface SearchStatus {
  readonly startedAt: number
  readonly phase?: SearchPhase | null
}
