import { localExtent, type LocalExtent, type LocalPoint } from '@ratamestari/core'

export interface RevealPlan {
  readonly startPauseMs: number
  readonly legEndsMs: readonly number[]
  readonly totalMs: number
}

const START_PAUSE_MS = 450
const MS_PER_LEG = 290
const LONGEST_LEGS_MS = 7500
// The rest of each leg's time is shared evenly, so a long leg is slower but not much slower.
const LEG_TIME_SHARE_BY_LENGTH = 0.4
const DESCRIPTION_HEADING_ROWS = 2

export function revealPlan(stops: readonly LocalPoint[]): RevealPlan {
  const lengths = stops
    .slice(1)
    .map((to, i) => Math.hypot(to[0] - stops[i]![0], to[1] - stops[i]![1]))
  const legs = lengths.length
  const meanLength = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, legs)
  const averageLegMs = Math.min(MS_PER_LEG, LONGEST_LEGS_MS / Math.max(1, legs))
  const legEndsMs: number[] = []
  let elapsed = START_PAUSE_MS
  for (const length of lengths) {
    const lengthWeight = meanLength > 0 ? length / meanLength : 1
    elapsed +=
      averageLegMs * (1 - LEG_TIME_SHARE_BY_LENGTH + LEG_TIME_SHARE_BY_LENGTH * lengthWeight)
    legEndsMs.push(elapsed)
  }
  return { startPauseMs: START_PAUSE_MS, legEndsMs, totalMs: elapsed }
}

const easeInOut = (share: number) => (1 - Math.cos(Math.PI * share)) / 2

// How far the course is drawn, in legs as courseOverprintStyle takes them, or null once it is done.
export function drawnLegsAt(plan: RevealPlan, elapsedMs: number): number | null {
  if (elapsedMs >= plan.totalMs) return null
  let legStartMs = plan.startPauseMs
  for (const [leg, legEndMs] of plan.legEndsMs.entries()) {
    if (elapsedMs < legEndMs) {
      const share = Math.max(0, (elapsedMs - legStartMs) / (legEndMs - legStartMs))
      return leg + easeInOut(share)
    }
    legStartMs = legEndMs
  }
  return null
}

// The description box grows a row at a time: the headings and the start at once, then each
// control's row as its circle appears.
export function revealedDescriptionExtent(
  extent: LocalExtent,
  controlCount: number,
  drawnLegs: number,
): LocalExtent {
  const [minX, minY, maxX, maxY] = extent
  const rows = DESCRIPTION_HEADING_ROWS + controlCount + 2
  const shownRows = Math.min(rows, DESCRIPTION_HEADING_ROWS + 1 + Math.floor(drawnLegs))
  const rowHeight = (maxY - minY) / rows
  return localExtent(minX, maxY - shownRows * rowHeight, maxX, maxY)
}
