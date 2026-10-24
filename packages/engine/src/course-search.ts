import type { LocalPoint } from '@ratamestari/core'
import {
  ACUTE_ANGLE,
  controlSpacingForScale,
  REFERENCE_PACE_SECONDS_PER_KM,
  type CourseTarget,
  type Format,
} from '@ratamestari/rules'
import type { ControlSiteCandidate, TechnicalDifficulty } from './control-sites'
import { difficultyInCourse, flagSideFor, type FlagSide } from './flag-side'
import { measureCourse } from './course-length'
import { isUsableInPrintArea, lineCrossesExtent, type PrintArea } from './print-area'
import { siteAreaQuality } from './site-quality'
import { distanceToSegment, segmentsCross } from './polyline'
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
  readonly printArea?: PrintArea
}

export interface CourseProblems {
  readonly spacing: number
  readonly acuteAngleWarnings: number
  readonly acuteAngleNotes: number
  readonly difficultyOutsideRange: number
  readonly courseLineCrossings: number
  readonly courseLinesThroughControls: number
  readonly courseLinesOutsideMap: number
  readonly courseLinesOverDescriptions: number
  readonly overlappingCircles: number
  readonly finalLegTooLong: boolean
}

export interface Course {
  readonly seed: number
  readonly start: ControlSiteCandidate
  readonly controls: readonly ControlSiteCandidate[]
  readonly finish: LocalPoint
  readonly legSeconds: readonly number[]
  readonly estimatedSeconds: number
  readonly targetSeconds: number
  readonly controlDifficulties: readonly TechnicalDifficulty[]
  readonly flagSides: readonly (FlagSide | null)[]
  readonly lengthMeters: number | null
  readonly climbMeters: number | null
  readonly printArea: PrintArea | null
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
export function expectedControlCount(format: Format): number {
  const { longLegShare, longLeg, shortLeg } = LEG_PROFILES[format]
  const mean = (range: readonly [number, number]) => (range[0] + range[1]) / 2
  const meanLegShare = longLegShare * mean(longLeg) + (1 - longLegShare) * mean(shortLeg)
  return Math.ceil(1 / meanLegShare)
}

const START_DISTANCE_FROM_FINISH: readonly [number, number] = [0.05, 0.2]
const MAX_START_DIFFICULTY = 2
const DEFAULT_IMPROVEMENT_STEPS: Readonly<Record<Format, number>> = { long: 800, middle: 400 }
const TREE_LIMIT_SHARE_OF_TARGET = 0.25
const SWAP_LEG_TIME_RANGE: readonly [number, number] = [0.5, 1.6]
const INSERT_LEG_TIME_RANGE: readonly [number, number] = [0.3, 1.2]
const TIME_TOLERANCE_SHARE = 0.02
const LENGTH_CHANGE_CHANCE = 0.3
const MIN_CONTROLS = 3
const PENALTY = {
  timeErrorPerPercent: 2,
  spacing: 50,
  acuteAngleWarning: 20,
  acuteAngleNote: 5,
  difficultyOutsideRange: 4,
  courseLineCrossing: 15,
  courseLineThroughControl: 10,
  finalLegPerPercentOverLimit: 5,
  courseLineOutsideMap: 30,
  courseLineOverDescriptions: 30,
  overlappingCircles: 15,
} as const
const CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS = 37.5
const FINISH_OUTER_CIRCLE_FOOTPRINT_RADIUS_METERS = 45
const FINAL_LEG_MAX_SHARE_OF_TARGET = 0.04
const REVERSE_SECTION_CHANCE = 0.25
const HEADING_HOME_SHARE_OF_TARGET = 0.25
const QUALITY_REWARD: Readonly<Record<Format, number>> = { long: 20, middle: 40 }
const QUALITY_PREFERENCE = 2
const ROUTE_CHOICE_REWARD_PER_KEY_LEG = 8
const ROUTE_CHOICE_PREFERENCE = 2
const MAX_KEY_LEGS = 4
const STRAIGHT_ON_ANGLE_DEGREES = 150
const STRAIGHT_ON_PENALTY: Readonly<Record<Format, number>> = { long: 0, middle: 3 }
const MIDDLE_CORE_RADIUS_METERS = 750
const LONG_MIN_AREA_QUALITY = 0.3
const MAX_DRAFTS = 3
const GOOD_DRAFT_SHARE_OF_TARGET = 0.85
const MIDDLE_CORE_REACH_SHARE_OF_TARGET = 0.4
const BRING_LAST_CONTROL_HOME_CHANCE = 0.5
const START_ADVANCE_FROM_FINISH_DEGREES: readonly [number, number] = [10, 70]
const MIN_ADVANCE_PER_CONTROL_DEGREES = 2
const MAX_ADVANCE_PER_EXPECTED = 2.5
const ADVANCE_SLACK_DEGREES = 15
const NO_SITE = -1

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
  const qualityBySiteId = siteAreaQuality(sites)
  const secondsToFinish = (site: ControlSiteCandidate) => {
    const index = cellIndexOf(grid, site.position)
    return index === null ? Number.POSITIVE_INFINITY : toFinishGrid[index]!
  }
  const { printArea } = spec
  const reachable = sites.filter(
    site =>
      (!printArea || isUsableInPrintArea(site.position, printArea)) &&
      secondsToFinish(site) <= targetSeconds / 2,
  )
  const core =
    spec.format === 'middle'
      ? densestCore(
          reachable.filter(
            site => secondsToFinish(site) <= MIDDLE_CORE_REACH_SHARE_OF_TARGET * targetSeconds,
          ),
          qualityBySiteId,
        )
      : null
  const pool = core
    ? reachable.filter(
        site =>
          distanceBetween(site.position, core) <= MIDDLE_CORE_RADIUS_METERS ||
          secondsToFinish(site) <= FINAL_LEG_MAX_SHARE_OF_TARGET * targetSeconds,
      )
    : reachable.filter(
        site =>
          qualityBySiteId[site.id]! >= LONG_MIN_AREA_QUALITY ||
          secondsToFinish(site) <= FINAL_LEG_MAX_SHARE_OF_TARGET * targetSeconds,
      )
  if (pool.length === 0) return null
  const poolCells = pool.map(site => cellIndexOf(grid, site.position)!)
  const toFinish = Float32Array.from(poolCells, cell => toFinishGrid[cell]!)
  const quality = Float32Array.from(pool, site => qualityBySiteId[site.id]!)

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

  const staysOnMap = (from: LocalPoint, to: LocalPoint) =>
    courseLineStaysOnMap(grid, terrain.mappedArea, from, to)
  const clearOfDescriptions = (from: LocalPoint, to: LocalPoint) =>
    !printArea || !lineCrossesExtent(from, to, printArea.descriptionBox)
  const isAllowedCourseLine = (from: LocalPoint, to: LocalPoint) =>
    staysOnMap(from, to) && clearOfDescriptions(from, to)
  const routeChoiceValue = (from: LocalPoint, to: LocalPoint, fastestSeconds: number) =>
    routeChoiceValueOf(straightLineSeconds(grid, from, to, pace), fastestSeconds)
  const evaluation = createEvaluation(
    pool,
    spec,
    finish,
    toFinish,
    legSeconds,
    targetSeconds,
    staysOnMap,
    clearOfDescriptions,
    quality,
    routeChoiceValue,
  )
  let startIndex = NO_SITE
  let order: number[] = []
  let best: ScoredCourse | null = null
  for (let draft = 0; draft < MAX_DRAFTS; draft++) {
    const loop = planLoop(pool, quality, core, random)
    const draftStart = pickStart(pool, toFinish, targetSeconds, loop, finish, core, random)
    if (draftStart === NO_SITE) continue
    const draftOrder = buildGreedy(
      draftStart,
      pool,
      toFinish,
      timesFrom,
      targetSeconds,
      spec,
      loop,
      finish,
      isAllowedCourseLine,
      quality,
      routeChoiceValue,
      random,
    )
    const scored = evaluation.score(draftStart, draftOrder)
    if (!best || scored.score < best.score) {
      best = scored
      startIndex = draftStart
      order = draftOrder
    }
    if (scored.estimatedSeconds >= GOOD_DRAFT_SHARE_OF_TARGET * targetSeconds) break
  }
  if (!best) return null
  onProgress(toCourse(best))

  const steps = spec.improvementSteps ?? DEFAULT_IMPROVEMENT_STEPS[spec.format]
  for (let step = 0; step < steps; step++) {
    const candidate = proposeChange(startIndex, order, pool, toFinish, timesFrom, best, random)
    if (!candidate) continue
    const scored = evaluation.score(startIndex, candidate)
    if (scored.score < best.score) {
      order = candidate
      best = scored
      onProgress(toCourse(best))
    }
  }
  return toCourse(best, true)

  function toCourse(scored: ScoredCourse, withLength = false): Course {
    const stops = [startIndex, ...scored.order].map(i => pool[i]!.position)
    const measured = withLength ? measureCourse(terrain, [...stops, finish]) : null
    const controls = scored.order.map(i => pool[i]!)
    const maxDifficulty = spec.target.siteDifficulty[1]
    return {
      seed: spec.seed,
      start: pool[startIndex]!,
      controls,
      controlDifficulties: controls.map(site => difficultyInCourse(site, maxDifficulty)),
      flagSides: controls.map((site, i) => flagSideFor(site, stops[i]!, maxDifficulty)),
      finish,
      legSeconds: scored.legSeconds,
      estimatedSeconds: scored.estimatedSeconds,
      targetSeconds,
      lengthMeters: measured?.lengthMeters ?? null,
      climbMeters: measured?.climbMeters ?? null,
      printArea: printArea ?? null,
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
  finish: LocalPoint,
  toFinish: Float32Array,
  legSecondsBetween: (from: number, to: number) => number,
  targetSeconds: number,
  staysOnMap: (from: LocalPoint, to: LocalPoint) => boolean,
  clearOfDescriptions: (from: LocalPoint, to: LocalPoint) => boolean,
  quality: Float32Array,
  routeChoiceValue: (from: LocalPoint, to: LocalPoint, fastestSeconds: number) => number,
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

    let straightOnTurns = 0
    let acuteAngleWarnings = 0
    let acuteAngleNotes = 0
    const stops = [...sequence.map(i => pool[i]!.position), finish]
    for (let i = 1; i + 1 < stops.length; i++) {
      const angle = angleAt(stops[i - 1]!, stops[i]!, stops[i + 1]!)
      if (angle < ACUTE_ANGLE.warningBelowDegrees) acuteAngleWarnings++
      else if (angle < ACUTE_ANGLE.noteBelowDegrees) acuteAngleNotes++
      if (angle > STRAIGHT_ON_ANGLE_DEGREES) straightOnTurns++
    }

    const keyLegValues = legSeconds
      .flatMap((seconds, i) =>
        seconds >= LEG_PROFILES.long.longLeg[0] * targetSeconds
          ? [routeChoiceValue(stops[i]!, stops[i + 1]!, seconds)]
          : [],
      )
      .sort((a, b) => b - a)
      .slice(0, MAX_KEY_LEGS)
    const routeChoiceTotal = keyLegValues.reduce((sum, value) => sum + value, 0)
    const meanQuality =
      order.length === 0 ? 0 : order.reduce((sum, i) => sum + quality[i]!, 0) / order.length
    const difficultyOutsideRange = order.filter(i => {
      const difficulty = difficultyInCourse(pool[i]!, maxDifficulty)
      return difficulty < minDifficulty || difficulty > maxDifficulty
    }).length

    const courseLineCrossings = countCourseLineCrossings(stops)
    const overlappingCircles = countOverlappingCircles(stops)
    let courseLinesOutsideMap = 0
    let courseLinesOverDescriptions = 0
    for (let i = 0; i + 1 < stops.length; i++) {
      if (!staysOnMap(stops[i]!, stops[i + 1]!)) courseLinesOutsideMap++
      if (!clearOfDescriptions(stops[i]!, stops[i + 1]!)) courseLinesOverDescriptions++
    }
    const courseLinesThroughControls = countCourseLinesThroughControls(stops)
    const finalLegShare = legSeconds[legSeconds.length - 1]! / targetSeconds
    const finalLegPercentOverLimit = Math.max(
      0,
      100 * (finalLegShare - FINAL_LEG_MAX_SHARE_OF_TARGET),
    )

    const problems = {
      spacing: spacingProblems,
      acuteAngleWarnings,
      acuteAngleNotes,
      difficultyOutsideRange,
      courseLineCrossings,
      courseLinesThroughControls,
      courseLinesOutsideMap,
      courseLinesOverDescriptions,
      overlappingCircles,
      finalLegTooLong: finalLegPercentOverLimit > 0,
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
          PENALTY.difficultyOutsideRange * difficultyOutsideRange +
          PENALTY.courseLineCrossing * courseLineCrossings +
          PENALTY.courseLineThroughControl * courseLinesThroughControls +
          PENALTY.finalLegPerPercentOverLimit * finalLegPercentOverLimit +
          PENALTY.courseLineOutsideMap * courseLinesOutsideMap +
          PENALTY.courseLineOverDescriptions * courseLinesOverDescriptions +
          PENALTY.overlappingCircles * overlappingCircles -
          QUALITY_REWARD[spec.format] * meanQuality +
          STRAIGHT_ON_PENALTY[spec.format] * straightOnTurns -
          (spec.format === 'long' ? ROUTE_CHOICE_REWARD_PER_KEY_LEG * routeChoiceTotal : 0),
    }
  }
  return { score }
}

interface Loop {
  readonly centre: LocalPoint
  readonly direction: 1 | -1
}

function planLoop(
  pool: readonly ControlSiteCandidate[],
  quality: Float32Array,
  core: LocalPoint | null,
  random: Random,
): Loop {
  const direction = random.next() < 0.5 ? 1 : -1
  if (core) return { centre: core, direction }
  const totalQuality = quality.reduce((sum, q) => sum + q, 0) || 1
  const centreX =
    pool.reduce((sum, site, i) => sum + site.position[0] * quality[i]!, 0) / totalQuality
  const centreY =
    pool.reduce((sum, site, i) => sum + site.position[1] * quality[i]!, 0) / totalQuality
  return { centre: [centreX, centreY] as const as LocalPoint, direction }
}

function densestCore(
  candidates: readonly ControlSiteCandidate[],
  qualityBySiteId: Float32Array,
): LocalPoint | null {
  let best: LocalPoint | null = null
  let bestTotal = -1
  for (const centre of candidates) {
    let total = 0
    for (const other of candidates) {
      if (distanceBetween(centre.position, other.position) <= MIDDLE_CORE_RADIUS_METERS) {
        total += qualityBySiteId[other.id]!
      }
    }
    if (total > bestTotal) {
      bestTotal = total
      best = centre.position
    }
  }
  return best
}

const loopAngle = (loop: Loop, [x, y]: LocalPoint) =>
  Math.atan2(y - loop.centre[1], x - loop.centre[0])

const loopAdvance = (loop: Loop, fromAngle: number, toAngle: number) => {
  const turn = (toAngle - fromAngle) * loop.direction
  return ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

const radians = (degrees: number) => (degrees * Math.PI) / 180

function pickStart(
  pool: readonly ControlSiteCandidate[],
  toFinish: Float32Array,
  targetSeconds: number,
  loop: Loop,
  finish: LocalPoint,
  core: LocalPoint | null,
  random: Random,
): number {
  if (core) {
    const inCore = pool.flatMap((site, i) =>
      site.technicalDifficulty <= MAX_START_DIFFICULTY &&
      toFinish[i]! >= START_DISTANCE_FROM_FINISH[0] * targetSeconds &&
      distanceBetween(site.position, core) <= MIDDLE_CORE_RADIUS_METERS
        ? [i]
        : [],
    )
    const start = random.pick(inCore)
    if (start !== undefined) return start
  }
  const [nearShare, farShare] = START_DISTANCE_FROM_FINISH
  const finishAngle = loopAngle(loop, finish)
  const [minAdvance, maxAdvance] = START_ADVANCE_FROM_FINISH_DEGREES.map(radians) as [
    number,
    number,
  ]
  const inRange = (maxDifficulty: number, isAheadOfFinish: boolean) =>
    pool.flatMap((site, i) => {
      if (site.technicalDifficulty > maxDifficulty) return []
      if (toFinish[i]! < nearShare * targetSeconds || toFinish[i]! > farShare * targetSeconds) {
        return []
      }
      const advance = loopAdvance(loop, finishAngle, loopAngle(loop, site.position))
      if (isAheadOfFinish && (advance < minAdvance || advance > maxAdvance)) return []
      return [i]
    })
  return (
    random.pick(inRange(MAX_START_DIFFICULTY, true)) ??
    random.pick(inRange(MAX_START_DIFFICULTY, false)) ??
    random.pick(inRange(5, false)) ??
    NO_SITE
  )
}

function buildGreedy(
  startIndex: number,
  pool: readonly ControlSiteCandidate[],
  toFinish: Float32Array,
  timesFrom: (poolIndex: number) => Float32Array,
  targetSeconds: number,
  spec: CourseSpec,
  loop: Loop,
  finish: LocalPoint,
  staysOnMap: (from: LocalPoint, to: LocalPoint) => boolean,
  quality: Float32Array,
  routeChoiceValue: (from: LocalPoint, to: LocalPoint, fastestSeconds: number) => number,
  random: Random,
): number[] {
  const startAngle = loopAngle(loop, pool[startIndex]!.position)
  const arcToFinish = loopAdvance(loop, startAngle, loopAngle(loop, finish))
  let travelledArc = 0
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
    const finalLegMax = FINAL_LEG_MAX_SHARE_OF_TARGET * targetSeconds
    if (remaining - toFinish[current]! < shortestLeg) break

    const isLongLeg = random.next() < profile.longLegShare
    const [low, high] = (isLongLeg ? profile.longLeg : profile.shortLeg).map(
      share => share * targetSeconds,
    ) as [number, number]
    const times = timesFrom(current)
    const currentAngle = loopAngle(loop, pool[current]!.position)
    const advanceTo = (i: number) =>
      loopAdvance(loop, currentAngle, loopAngle(loop, pool[i]!.position))
    const used = new Set([startIndex, ...order])
    const fits = (i: number, widen: number) => {
      const t = times[i]!
      if (used.has(i) || t < low / widen || t > high * widen) return false
      if (t + toFinish[i]! > remaining) return false
      const site = pool[i]!
      const wouldBeLastControl = remaining - t - toFinish[i]! < shortestLeg
      if (wouldBeLastControl && toFinish[i]! > finalLegMax) return false
      if (wouldBeLastControl) {
        if (
          angleAt(pool[current]!.position, site.position, finish) < ACUTE_ANGLE.noteBelowDegrees
        ) {
          return false
        }
        if (!staysOnMap(site.position, finish)) return false
        const finishClearance =
          CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS + FINISH_OUTER_CIRCLE_FOOTPRINT_RADIUS_METERS
        if (distanceBetween(site.position, finish) < finishClearance) return false
      }
      if (spec.format === 'long') {
        const advance = advanceTo(i)
        const expected = (2 * Math.PI * t) / targetSeconds
        if (advance < radians(MIN_ADVANCE_PER_CONTROL_DEGREES)) return false
        if (advance > expected * MAX_ADVANCE_PER_EXPECTED + radians(ADVANCE_SLACK_DEGREES)) {
          return false
        }
        if (travelledArc + advance > arcToFinish) return false
      }
      const tooClose = [...used].some(u => {
        const other = pool[u]!
        const minimum =
          other.isomCode === site.isomCode
            ? spacing.minStraightMetersForSimilarSites
            : spacing.minStraightMeters
        const circlesApart = 2 * CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS
        return distanceBetween(other.position, site.position) < Math.max(minimum, circlesApart)
      })
      if (tooClose) return false
      if (!staysOnMap(pool[current]!.position, site.position)) return false
      if (previous !== NO_SITE) {
        const angle = angleAt(pool[previous]!.position, pool[current]!.position, site.position)
        if (angle < ACUTE_ANGLE.noteBelowDegrees) return false
      }
      const stops = [startIndex, ...order].map(u => pool[u]!.position)
      const from = pool[current]!.position
      for (let k = 0; k + 1 < stops.length - 1; k++) {
        if (segmentsCross(stops[k]!, stops[k + 1]!, from, site.position)) return false
      }
      for (let k = 0; k < stops.length - 1; k++) {
        if (
          distanceToSegment(stops[k]!, from, site.position) < CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS
        ) {
          return false
        }
        if (
          distanceToSegment(site.position, stops[k]!, stops[k + 1]!) <
          CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS
        ) {
          return false
        }
      }
      return true
    }
    const isInDifficultyRange = (i: number) => {
      const difficulty = difficultyInCourse(pool[i]!, maxDifficulty)
      return difficulty >= minDifficulty && difficulty <= maxDifficulty
    }
    const fitting = (widen: number, inRangeOnly: boolean) =>
      pool.flatMap((_, i) =>
        (!inRangeOnly || isInDifficultyRange(i)) && fits(i, widen) ? [i] : [],
      )
    let candidates = fitting(1, true)
    if (candidates.length === 0) candidates = fitting(1.5, true)
    if (candidates.length === 0) candidates = fitting(1.5, false)
    if (candidates.length === 0) break

    const isHeadingHome = remaining < HEADING_HOME_SHARE_OF_TARGET * targetSeconds
    const preference = (i: number) => {
      const difficulty = difficultyInCourse(pool[i]!, maxDifficulty)
      const inRange = difficulty >= minDifficulty && difficulty <= maxDifficulty
      const closerToFinish = isHeadingHome ? 2 * (1 - toFinish[i]! / remaining) : 0
      const expected = (2 * Math.PI * times[i]!) / targetSeconds
      const onPace = Math.max(0, 1 - Math.abs(advanceTo(i) - expected) / Math.max(expected, 0.01))
      return (
        random.next() +
        (inRange ? 1 : 0) +
        closerToFinish +
        onPace +
        QUALITY_PREFERENCE * quality[i]! +
        (isLongLeg
          ? ROUTE_CHOICE_PREFERENCE *
            routeChoiceValue(pool[current]!.position, pool[i]!.position, times[i]!)
          : 0)
      )
    }
    const next = candidates.reduce((a, b) => (preference(b) > preference(a) ? b : a))
    travelledArc += advanceTo(next)
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
  toFinish: Float32Array,
  timesFrom: (poolIndex: number) => Float32Array,
  current: ScoredCourse,
  random: Random,
): number[] | null {
  if (order.length === 0) {
    const fromStart = timesFrom(startIndex)
    const firstControls = pool.flatMap((_, i) =>
      i !== startIndex && Number.isFinite(fromStart[i]!) && Number.isFinite(toFinish[i]!)
        ? [i]
        : [],
    )
    const first = random.pick(firstControls)
    return first === undefined ? null : [first]
  }
  const used = new Set([startIndex, ...order])
  const isTooLong = current.estimatedSeconds > current.targetSeconds * (1 + TIME_TOLERANCE_SHARE)
  const isTooShort = current.estimatedSeconds < current.targetSeconds * (1 - TIME_TOLERANCE_SHARE)
  const position = Math.floor(random.next() * order.length)

  if (current.problems.finalLegTooLong && random.next() < BRING_LAST_CONTROL_HOME_CHANCE) {
    const last = order.length - 1
    const beforeLast = last === 0 ? startIndex : order[last - 1]!
    const fromBeforeLast = timesFrom(beforeLast)
    const finalLegMax = FINAL_LEG_MAX_SHARE_OF_TARGET * current.targetSeconds
    const nearFinish = pool.flatMap((_, i) =>
      !used.has(i) && toFinish[i]! <= finalLegMax && Number.isFinite(fromBeforeLast[i]!) ? [i] : [],
    )
    const home = random.pick(nearFinish)
    if (home !== undefined) return [...order.slice(0, last), home]
  }

  if (order.length >= 2 && random.next() < REVERSE_SECTION_CHANCE) {
    const end = position + 1 + Math.floor(random.next() * (order.length - position - 1))
    if (end > position) {
      return [
        ...order.slice(0, position),
        ...order.slice(position, end + 1).reverse(),
        ...order.slice(end + 1),
      ]
    }
  }

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

function countCourseLineCrossings(stops: readonly LocalPoint[]): number {
  let crossings = 0
  for (let a = 0; a + 1 < stops.length; a++) {
    for (let b = a + 2; b + 1 < stops.length; b++) {
      if (segmentsCross(stops[a]!, stops[a + 1]!, stops[b]!, stops[b + 1]!)) crossings++
    }
  }
  return crossings
}

function countCourseLinesThroughControls(stops: readonly LocalPoint[]): number {
  let count = 0
  for (let leg = 0; leg + 1 < stops.length; leg++) {
    for (let control = 1; control < stops.length - 1; control++) {
      if (control === leg || control === leg + 1) continue
      const distance = distanceToSegment(stops[control]!, stops[leg]!, stops[leg + 1]!)
      if (distance < CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS) count++
    }
  }
  return count
}

function countOverlappingCircles(stops: readonly LocalPoint[]): number {
  const radiusOf = (i: number) =>
    i === stops.length - 1
      ? FINISH_OUTER_CIRCLE_FOOTPRINT_RADIUS_METERS
      : CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS
  let count = 0
  for (let a = 0; a < stops.length; a++) {
    for (let b = a + 1; b < stops.length; b++) {
      if (distanceBetween(stops[a]!, stops[b]!) < radiusOf(a) + radiusOf(b)) count++
    }
  }
  return count
}

function courseLineStaysOnMap(
  grid: CostGrid,
  mappedArea: Uint8Array,
  from: LocalPoint,
  to: LocalPoint,
): boolean {
  const samples = Math.max(1, Math.ceil(distanceBetween(from, to) / grid.cellSizeMeters))
  for (let s = 0; s <= samples; s++) {
    const t = s / samples
    const index = cellIndexOf(grid, [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ] as const as LocalPoint)
    if (index === null || !mappedArea[index]) return false
  }
  return true
}

function straightLineSeconds(
  grid: CostGrid,
  from: LocalPoint,
  to: LocalPoint,
  paceSecondsPerKm: number,
): number {
  const length = distanceBetween(from, to)
  const samples = Math.max(1, Math.ceil(length / grid.cellSizeMeters))
  const stepSeconds = ((length / samples) * paceSecondsPerKm) / 1000
  let seconds = 0
  for (let s = 0; s < samples; s++) {
    const t = (s + 0.5) / samples
    const index = cellIndexOf(grid, [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ] as const as LocalPoint)
    const speed = index === null ? BLOCKED : grid.speed[index]!
    if (speed === BLOCKED) return Number.POSITIVE_INFINITY
    seconds += stepSeconds / speed
  }
  return seconds
}

const ROUTE_CHOICE_RATIO_FULL_FROM = 1.05
const ROUTE_CHOICE_RATIO_FULL_UNTIL = 1.3
const ROUTE_CHOICE_RATIO_FADED_AT = 2
const FORCED_DETOUR_VALUE = 0.3

function routeChoiceValueOf(straightSeconds: number, fastestSeconds: number): number {
  if (fastestSeconds <= 0) return 0
  if (!Number.isFinite(straightSeconds)) return FORCED_DETOUR_VALUE
  const ratio = straightSeconds / fastestSeconds
  if (ratio <= 1) return 0
  if (ratio < ROUTE_CHOICE_RATIO_FULL_FROM) return (ratio - 1) / (ROUTE_CHOICE_RATIO_FULL_FROM - 1)
  if (ratio <= ROUTE_CHOICE_RATIO_FULL_UNTIL) return 1
  const fade =
    (ratio - ROUTE_CHOICE_RATIO_FULL_UNTIL) /
    (ROUTE_CHOICE_RATIO_FADED_AT - ROUTE_CHOICE_RATIO_FULL_UNTIL)
  return Math.max(FORCED_DETOUR_VALUE, 1 - fade * (1 - FORCED_DETOUR_VALUE))
}
