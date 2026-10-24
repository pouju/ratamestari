import type { SearchPhase } from '@ratamestari/engine'

export type { SearchPhase }

export interface SearchStatus {
  readonly startedAt: number
  readonly phase?: SearchPhase | null
}
