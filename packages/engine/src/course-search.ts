import type { LocalPoint } from '@ratamestari/core'
import {
  ACUTE_ANGLE,
  controlSpacingForScale,
  REFERENCE_PACE_SECONDS_PER_KM,
  type CourseTarget,
  type Format,
} from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import { BLOCKED, type CostGrid } from './cost-grid'
import { seededRandom, type Random } from './random'
import { cellCenterOf, cellIndexOf } from './raster'
import type { Terrain } from './terrain'
import { secondsFrom } from './time-tree'

export interface CourseSpec {
  readonly target: CourseTarget
  readonly format: Format
  readonly mapScale: number
  readonly competitionCentre: LocalPoint
  readonly seed: number
  readonly paceSecondsPerKm?: number
  readonly improvementSteps?: number
}

export interface CourseProblems {
  readonly spacing: number
  readonly acuteAngleWarnings: number
  readonly acuteAngleNotes: number
  readonly difficultyOutsideRange: number
}

export interface Course {
  readonly seed: number
  readonly start: ControlSiteCandidate
  readonly controls: readonly ControlSiteCandidate[]
  readonly finish: LocalPoint
  readonly legSeconds: readonly number[]
  readonly estimatedSeconds: number
  readonly targetSeconds: number
  readonly problems: CourseProblems
  readonly score: number
}

interface LegProfile {
  readonly longLegShare: number
  readonly longLeg: readonly [number, number]
  readonly shortLeg: readonly [number, number]
}

const LEG_PROFILES: Readonly<Record<Format, LegProfile>> = {
  long: { longLegShare: 0.3, longLeg: [0.06, 0.12], shortLeg: [0.015, 0.04] },
  middle: { longLegShare: 0, longLeg: [0.02, 0.07], shortLeg: [0.02, 0.07] },
}
const START_DISTANCE_FROM_FINISH: readonly [number, number] = [0.05, 0.2]
const MAX_START_DIFFICULTY = 2
const DEFAULT_IMPROVEMENT_STEPS = 400
const TREE_LIMIT_SHARE_OF_TARGET = 0.25
const SWAP_LEG_TIME_RANGE: readonly [number, number] = [0.5, 1.6]
const INSERT_LEG_TIME_RANGE: readonly [number, number] = [0.2, 0.8]
const TIME_TOLERANCE_SHARE = 0.02
const LENGTH_CHANGE_CHANCE = 0.3
const MIN_CONTROLS = 3
const PENALTY = {
  timeErrorPerPercent: 1,
  spacing: 50,
  acuteAngleWarning: 10,
  acuteAngleNote: 3,
  difficultyOutsideRange: 4,
} as const
const NO_SITE = -1

type Point = { readonly position: LocalPoint }

export function searchCourse(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  onProgress: (course: Course) => void = () => {},
): Course | null {
  const { grid } = terrain
  const random = seededRandom(spec.seed)
  const pace = spec.paceSecondsPerKm ?? REFERENCE_PACE_SECONDS_PER_KM.value
  const targetSeconds = spec.target.winningTime.targetMinutes * 60
  const openCentre = nearestOpenPoint(grid, spec.competitionCentre)
  if (!openCentre) return null
  const finish: LocalPoint = openCentre

  const toFinishGrid = secondsFrom(grid, finish, pace, Number.POSITIVE_INFINITY)
  const pool = sites.filter(site => {
    const index = cellIndexOf(grid, site.position)
    return index !== null && toFinishGrid[index]! <= targetSeconds / 2
  })
  if (pool.length === 0) return null
  const poolCells = pool.map(site => cellIndexOf(grid, site.position)!)
  const toFinish = Float32Array.from(poolCells, cell => toFinishGrid[cell]!)

  const treeLimit = targetSeconds * TREE_LIMIT_SHARE_OF_TARGET
  const timesCache = new Map<number, Float32Array>()
  const timesFrom = (poolIndex: number): Float32Array => {
    const cached = timesCache.get(poolIndex)
    if (cached) return cached
    const tree = secondsFrom(grid, pool[poolIndex]!.position, pace, treeLimit)
    const times = Float32Array.from(poolCells, cell => tree[cell]!)
    timesCache.set(poolIndex, times)
    return times
  }
  const legSeconds = (from: number, to: number): number => {
    if (timesCache.has(from)) return timesFrom(from)[to]!
    if (timesCache.has(to)) return timesFrom(to)[from]!
    return timesFrom(from)[to]!
  }

  const evaluation = createEvaluation(pool, spec, toFinish, legSeconds, targetSeconds)
  const startIndex = pickStart(pool, toFinish, targetSeconds, random)
  if (startIndex === NO_SITE) return null

  let order = buildGreedy(startIndex, pool, toFinish, timesFrom, targetSeconds, spec, random)
  let best = evaluation.score(startIndex, order)
  onProgress(toCourse(best))

  const steps = spec.improvementSteps ?? DEFAULT_IMPROVEMENT_STEPS
  for (let step = 0; step < steps; step++) {
    const candidate = proposeChange(startIndex, order, pool, timesFrom, best, random)
    if (!candidate) continue
    const scored = evaluation.score(startIndex, candidate)
    if (scored.score < best.score) {
      order = candidate
      best = scored
      onProgress(toCourse(best))
    }
  }
  return toCourse(best)

  function toCourse(scored: ScoredCourse): Course {
    return {
      seed: spec.seed,
      start: pool[startIndex]!,
      controls: scored.order.map(i => pool[i]!),
      finish,
      legSeconds: scored.legSeconds,
      estimatedSeconds: scored.estimatedSeconds,
      targetSeconds,
      problems: scored.problems,
      score: scored.score,
    }
  }
}

interface ScoredCourse {
  readonly order: readonly number[]
  readonly legSeconds: readonly number[]
  readonly estimatedSeconds: number
  readonly targetSeconds: number
  readonly problems: CourseProblems
  readonly score: number
}

function createEvaluation(
  pool: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  toFinish: Float32Array,
  legSecondsBetween: (from: number, to: number) => number,
  targetSeconds: number,
) {
  const spacing = controlSpacingForScale(spec.mapScale)
  const [minDifficulty, maxDifficulty] = spec.target.siteDifficulty

  const score = (startIndex: number, order: readonly number[]): ScoredCourse => {
    const sequence = [startIndex, ...order]
    const legSeconds = [
      ...order.map((site, i) => legSecondsBetween(sequence[i]!, site)),
      toFinish[sequence[sequence.length - 1]!]!,
    ]
    const estimatedSeconds = legSeconds.reduce((sum, s) => sum + s, 0)

    let spacingProblems = 0
    for (let a = 0; a < sequence.length; a++) {
      for (let b = a + 1; b < sequence.length; b++) {
        const siteA = pool[sequence[a]!]!
        const siteB = pool[sequence[b]!]!
        const distance = distanceBetween(siteA.position, siteB.position)
        const minimum =
          siteA.isomCode === siteB.isomCode
            ? spacing.minStraightMetersForSimilarSites
            : spacing.minStraightMeters
        if (distance < minimum) spacingProblems++
      }
    }

    let acuteAngleWarnings = 0
    let acuteAngleNotes = 0
    const points: Point[] = sequence.map(i => pool[i]!)
    for (let i = 1; i < points.length; i++) {
      const next = points[i + 1]
      if (!next) break
      const angle = angleAt(points[i - 1]!.position, points[i]!.position, next.position)
      if (angle < ACUTE_ANGLE.warningBelowDegrees) acuteAngleWarnings++
      else if (angle < ACUTE_ANGLE.noteBelowDegrees) acuteAngleNotes++
    }

    const difficultyOutsideRange = order.filter(i => {
      const difficulty = pool[i]!.technicalDifficulty
      return difficulty < minDifficulty || difficulty > maxDifficulty
    }).length

    const problems = {
      spacing: spacingProblems,
      acuteAngleWarnings,
      acuteAngleNotes,
      difficultyOutsideRange,
    }
    const timeErrorPercent = (100 * Math.abs(estimatedSeconds - targetSeconds)) / targetSeconds
    const isUnreachable = !Number.isFinite(estimatedSeconds)
    return {
      order,
      legSeconds,
      estimatedSeconds,
      targetSeconds,
      problems,
      score: isUnreachable
        ? Number.POSITIVE_INFINITY
        : PENALTY.timeErrorPerPercent * timeErrorPercent +
          PENALTY.spacing * spacingProblems +
          PENALTY.acuteAngleWarning * acuteAngleWarnings +
          PENALTY.acuteAngleNote * acuteAngleNotes +
          PENALTY.difficultyOutsideRange * difficultyOutsideRange,
    }
  }
  return { score }
}

function pickStart(
  pool: readonly ControlSiteCandidate[],
  toFinish: Float32Array,
  targetSeconds: number,
  random: Random,
): number {
  const [nearShare, farShare] = START_DISTANCE_FROM_FINISH
  const inRange = (maxDifficulty: number) =>
    pool.flatMap((site, i) =>
      site.technicalDifficulty <= maxDifficulty &&
      toFinish[i]! >= nearShare * targetSeconds &&
      toFinish[i]! <= farShare * targetSeconds
        ? [i]
        : [],
    )
  return random.pick(inRange(MAX_START_DIFFICULTY)) ?? random.pick(inRange(5)) ?? NO_SITE
}

function buildGreedy(
  startIndex: number,
  pool: readonly ControlSiteCandidate[],
  toFinish: Float32Array,
  timesFrom: (poolIndex: number) => Float32Array,
  targetSeconds: number,
  spec: CourseSpec,
  random: Random,
): number[] {
  const profile = LEG_PROFILES[spec.format]
  const [minDifficulty, maxDifficulty] = spec.target.siteDifficulty
  const spacing = controlSpacingForScale(spec.mapScale)
  const order: number[] = []
  let current = startIndex
  let previous = NO_SITE
  let elapsed = 0

  for (;;) {
    const remaining = targetSeconds - elapsed
    const shortestLeg = profile.shortLeg[0] * targetSeconds
    if (remaining - toFinish[current]! < shortestLeg) break

    const isLongLeg = random.next() < profile.longLegShare
    const [low, high] = (isLongLeg ? profile.longLeg : profile.shortLeg).map(
      share => share * targetSeconds,
    ) as [number, number]
    const times = timesFrom(current)
    const used = new Set([startIndex, ...order])
    const fits = (i: number, widen: number) => {
      const t = times[i]!
      if (used.has(i) || t < low / widen || t > high * widen) return false
      if (t + toFinish[i]! > remaining) return false
      const site = pool[i]!
      const tooClose = [...used].some(u => {
        const other = pool[u]!
        const minimum =
          other.isomCode === site.isomCode
            ? spacing.minStraightMetersForSimilarSites
            : spacing.minStraightMeters
        return distanceBetween(other.position, site.position) < minimum
      })
      if (tooClose) return false
      if (previous !== NO_SITE) {
        const angle = angleAt(pool[previous]!.position, pool[current]!.position, site.position)
        if (angle < ACUTE_ANGLE.noteBelowDegrees) return false
      }
      return true
    }
    let candidates = pool.flatMap((_, i) => (fits(i, 1) ? [i] : []))
    if (candidates.length === 0) candidates = pool.flatMap((_, i) => (fits(i, 1.5) ? [i] : []))
    if (candidates.length === 0) break

    const preference = (i: number) => {
      const difficulty = pool[i]!.technicalDifficulty
      const inRange = difficulty >= minDifficulty && difficulty <= maxDifficulty
      return random.next() + (inRange ? 1 : 0)
    }
    const next = candidates.reduce((a, b) => (preference(b) > preference(a) ? b : a))
    order.push(next)
    elapsed += times[next]!
    previous = current
    current = next
  }
  return order
}

function proposeChange(
  startIndex: number,
  order: readonly number[],
  pool: readonly ControlSiteCandidate[],
  timesFrom: (poolIndex: number) => Float32Array,
  current: ScoredCourse,
  random: Random,
): number[] | null {
  if (order.length === 0) return null
  const used = new Set([startIndex, ...order])
  const isTooLong = current.estimatedSeconds > current.targetSeconds * (1 + TIME_TOLERANCE_SHARE)
  const isTooShort = current.estimatedSeconds < current.targetSeconds * (1 - TIME_TOLERANCE_SHARE)
  const position = Math.floor(random.next() * order.length)

  if (isTooLong && order.length > MIN_CONTROLS && random.next() < LENGTH_CHANGE_CHANCE) {
    return order.filter((_, i) => i !== position)
  }

  const previous = position === 0 ? startIndex : order[position - 1]!
  const legSeconds = current.legSeconds[position]!
  const fromPrevious = timesFrom(previous)
  const candidatesWithin = (lowShare: number, highShare: number) =>
    pool.flatMap((_, i) => {
      const t = fromPrevious[i]!
      return !used.has(i) && t >= legSeconds * lowShare && t <= legSeconds * highShare ? [i] : []
    })

  if (isTooShort && random.next() < LENGTH_CHANGE_CHANCE) {
    const inserted = random.pick(candidatesWithin(...INSERT_LEG_TIME_RANGE))
    if (inserted === undefined) return null
    return [...order.slice(0, position), inserted, ...order.slice(position)]
  }

  const replacement = random.pick(candidatesWithin(...SWAP_LEG_TIME_RANGE))
  if (replacement === undefined) return null
  const changed = [...order]
  changed[position] = replacement
  return changed
}

function nearestOpenPoint(grid: CostGrid, target: LocalPoint): LocalPoint | null {
  const targetIndex = cellIndexOf(grid, target)
  if (targetIndex !== null && grid.speed[targetIndex] !== BLOCKED) return target
  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  grid.speed.forEach((speed, index) => {
    if (speed === BLOCKED) return
    const [x, y] = cellCenterOf(grid, index)
    const distance = Math.hypot(x - target[0], y - target[1])
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best === null ? null : cellCenterOf(grid, best)
}

const distanceBetween = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

function angleAt(previous: LocalPoint, vertex: LocalPoint, next: LocalPoint): number {
  const ax = previous[0] - vertex[0]
  const ay = previous[1] - vertex[1]
  const bx = next[0] - vertex[0]
  const by = next[1] - vertex[1]
  const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by)
  if (lengths === 0) return 180
  return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / lengths))) * 180) / Math.PI
}
