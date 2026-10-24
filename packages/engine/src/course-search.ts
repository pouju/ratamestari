import type { LocalPoint } from '@ratamestari/core'
import {
  ACUTE_ANGLE,
  COURSE_LINE_CROSSING,
  COURSE_SHAPE,
  FOREST_CONTROL_SPACING,
  FORMAT_QUALITY,
  SCORE_WEIGHTS,
  controlSpacingForScale,
  REFERENCE_PACE_SECONDS_PER_KM,
  type CourseTarget,
  type Format,
  type ScoreTermName,
} from '@ratamestari/rules'
import type { ControlSiteCandidate, TechnicalDifficulty } from './control-sites'
import { difficultyInCourse, flagSideFor, type FlagSide } from './flag-side'
import { measureCourse } from './course-length'
import { findRoute } from './router'
import { planWaypoints } from './waypoints'
import {
  alternation,
  closeness,
  crossingSeverity,
  legCount,
  parallelLegs,
  routeDoglegOverlaps,
  directionChanges,
  firstLegTowardsFinish,
  legLengthDistribution,
  mappedAreaWithin,
  reversals,
  ring,
  spread,
  type Metric,
} from './course-metrics'
import {
  isUsableInPrintArea,
  lineCrossesExtent,
  reservedBoxesOf,
  type PaperBoxSize,
  type PrintArea,
} from './print-area'
import { siteAreaQualityOf, type SiteQualityOf } from './site-quality'
import { distanceToSegment, segmentsCross } from './polyline'
import { BLOCKED, routableCellOf, type CostGrid } from './cost-grid'
import { seededRandom, type Random } from './random'
import { cellCenterOf, cellIndexOf } from './raster'
import type { Terrain } from './terrain'
import { secondsFrom } from './time-tree'

export interface CourseSpec {
  readonly target: CourseTarget
  readonly format: Format
  readonly printScale: number
  readonly competitionCentre: LocalPoint
  readonly seed: number
  readonly paceSecondsPerKm?: number
  readonly improvementSteps?: number
  readonly printArea?: PrintArea
  readonly peripheralSize?: PaperBoxSize | null
  // The user's wish for the start, as straight-line metres from the finish.
  readonly startDistanceFromFinishMeters?: readonly [number, number] | null
}

export interface Finding {
  readonly kind: keyof CourseProblems
  readonly stops: readonly number[]
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
  readonly winningTimeOutsideRange: boolean
  readonly controlsWithoutFeature: number
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
  readonly findings: readonly Finding[]
  readonly breakdown: ScoreBreakdown
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
const MAX_SITE_DIFFICULTY = 5
const DEFAULT_IMPROVEMENT_STEPS: Readonly<Record<Format, number>> = { long: 800, middle: 400 }
const TREE_LIMIT_SHARE_OF_TARGET = 0.25
const SWAP_LEG_TIME_RANGE: readonly [number, number] = [0.5, 1.6]
const INSERT_LEG_TIME_RANGE: readonly [number, number] = [0.3, 1.2]
const TIME_TOLERANCE_SHARE = 0.02
const LENGTH_CHANGE_CHANCE = 0.3
const MIN_CONTROLS = 3
const CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS = 37.5
const FINISH_OUTER_CIRCLE_FOOTPRINT_RADIUS_METERS = 45
const MIN_CONTROL_SEPARATION_METERS = Math.max(
  FOREST_CONTROL_SPACING.minStraightMetersForSimilarSites,
  2 * CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS,
)
const FINISH_CLEARANCE_METERS =
  CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS + FINISH_OUTER_CIRCLE_FOOTPRINT_RADIUS_METERS
const FINAL_LEG_MAX_SHARE_OF_TARGET = 0.04
const REVERSE_SECTION_CHANCE = 0.25
const SHIFT_CHANCE = 0.4
const TARGET_FLAGGED_CONTROL_CHANCE = 0.5
const SHIFT_RADIUS_METERS = 150
const MAX_BACKTRACKS = 8
const DOGLEG_REPAIR_RADIUS_METERS = 250
const HARD_RULE_REPAIR_RADIUS_METERS = 400
// A dogleg is worth giving up this much of the score to remove, but never a hard rule.
const DOGLEG_WORTH = 60
const HEADING_HOME_SHARE_OF_TARGET = 0.25
const QUALITY_PREFERENCE = 2
const ROUTE_CHOICE_PREFERENCE = 2
const MAX_KEY_LEGS = 4
const MIDDLE_CORE_RADIUS_METERS = 750
const LONG_MIN_AREA_QUALITY = 0.3
const MAX_DRAFTS = 3
const GOOD_DRAFT_SHARE_OF_TARGET = 0.85
const MIDDLE_CORE_REACH_SHARE_OF_TARGET = 0.4
const BRING_LAST_CONTROL_HOME_CHANCE = 0.5
const WAYPOINT_PREFERENCE = 2
const MAX_DETOUR_FROM_WAYPOINT_SHARE_OF_LEG = 0.3
const START_TOWARDS_WAYPOINT_PREFERENCE = 1
const LONG_LEG_FROM_METRES = 800
const WIDER_LEG_BAND = 1.5
const NO_SITE = -1

// A search yields the course so far when it improves, or null at a pause point. Whoever runs it
// can pause there, and passes true to next() to stop: the search then returns its best course.
export type SearchStep = Course | null
export type Search = Generator<SearchStep, Course | null, boolean | undefined>

export function runSearch(search: Search, onProgress: (course: Course) => void = () => {}) {
  for (let step = search.next(); ; step = search.next()) {
    if (step.done) return step.value
    if (step.value) onProgress(step.value)
  }
}

export function searchCourse(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  onProgress: (course: Course) => void = () => {},
): Course | null {
  return runSearch(searchCourseSteps(terrain, sites, spec), onProgress)
}

export function* searchCourseSteps(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
): Search {
  const { grid } = terrain
  const random = seededRandom(spec.seed)
  const pace = spec.paceSecondsPerKm ?? REFERENCE_PACE_SECONDS_PER_KM.value
  const targetSeconds = spec.target.winningTime.targetMinutes * 60
  const openCentre = nearestOpenPoint(grid, spec.competitionCentre)
  if (!openCentre) return null
  const finish: LocalPoint = openCentre

  const toFinishGrid = secondsFrom(grid, finish, pace, Number.POSITIVE_INFINITY)
  const qualityOf = siteAreaQualityOf(sites)
  const secondsToFinish = (site: ControlSiteCandidate) => {
    const index = routableCellOf(grid, site.position)
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
          qualityOf,
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
          qualityOf(site) >= LONG_MIN_AREA_QUALITY ||
          secondsToFinish(site) <= FINAL_LEG_MAX_SHARE_OF_TARGET * targetSeconds,
      )
  if (pool.length === 0) return null
  const poolCells = pool.map(site => routableCellOf(grid, site.position))
  const toFinish = Float32Array.from(poolCells, cell =>
    cell === null ? Number.POSITIVE_INFINITY : toFinishGrid[cell]!,
  )
  const quality = Float32Array.from(pool, qualityOf)

  const treeLimit = targetSeconds * TREE_LIMIT_SHARE_OF_TARGET
  const timesCache = new Map<number, Float32Array>()
  const timesFrom = (poolIndex: number): Float32Array => {
    const cached = timesCache.get(poolIndex)
    if (cached) return cached
    const tree = secondsFrom(grid, pool[poolIndex]!.position, pace, treeLimit)
    const times = Float32Array.from(poolCells, cell =>
      cell === null ? Number.POSITIVE_INFINITY : tree[cell]!,
    )
    timesCache.set(poolIndex, times)
    return times
  }
  // Costs are symmetric. When neither end has a tree yet, build it from the later stop: that is
  // a control of the course, reused by the next move, while the earlier one is often a candidate.
  const legSeconds = (from: number, to: number): number => {
    if (timesCache.has(from)) return timesFrom(from)[to]!
    return timesFrom(to)[from]!
  }

  const { evaluation, isAllowedCourseLine, routeChoiceValue } = evaluationFor(
    terrain,
    spec,
    pool,
    finish,
    toFinish,
    legSeconds,
    quality,
  )
  const context: CourseContext = { terrain, spec, pool, finish, targetSeconds, evaluation }
  let startIndex = NO_SITE
  let order: number[] = []
  let best: ScoredCourse | null = null
  for (let draft = 0; draft < MAX_DRAFTS; draft++) {
    const zoneCandidates = core
      ? pool.flatMap((site, i) =>
          distanceBetween(site.position, core) <= MIDDLE_CORE_RADIUS_METERS ? [i] : [],
        )
      : pool.map((_, i) => i)
    const waypoints = planWaypoints(
      zoneCandidates.map(i => pool[i]!),
      Float32Array.from(zoneCandidates, i => quality[i]!),
      finish,
      FORMAT_QUALITY[spec.format],
      random,
    )
    const draftStart = pickStart(
      pool,
      toFinish,
      targetSeconds,
      waypoints,
      finish,
      core,
      spec.startDistanceFromFinishMeters ?? null,
      random,
    )
    if (draftStart === NO_SITE) continue
    const draftOrder = buildGreedy(
      draftStart,
      pool,
      toFinish,
      timesFrom,
      targetSeconds,
      spec,
      waypoints,
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
    if (yield null) break
  }
  if (!best) return null
  let stopped = Boolean(yield toCourse(best))

  const steps = spec.improvementSteps ?? DEFAULT_IMPROVEMENT_STEPS[spec.format]
  for (let step = 0; step < steps && !stopped; step++) {
    const candidate = proposeChange(
      startIndex,
      order,
      pool,
      toFinish,
      timesFrom,
      best,
      finish,
      random,
    )
    if (!candidate) continue
    const scored = evaluation.score(startIndex, candidate)
    const improves = scored.score < best.score && !addsLineProblems(best.problems, scored.problems)
    if (improves) {
      order = candidate
      best = scored
    }
    stopped = Boolean(yield improves ? toCourse(best) : null)
  }
  const cleared = repairHardRules(startIndex, best, pool, evaluation)
  const repaired = repairDoglegs(startIndex, cleared, pool, finish, grid, pace, evaluation)
  if (repaired !== best.order) best = evaluation.score(startIndex, repaired)
  return toCourse(best, true)

  function toCourse(scored: ScoredCourse, withLength = false): Course {
    return assembleCourse(context, startIndex, scored.order, withLength)
  }
}

export interface CourseContext {
  readonly terrain: Terrain
  readonly spec: CourseSpec
  readonly pool: readonly ControlSiteCandidate[]
  readonly finish: LocalPoint
  readonly targetSeconds: number
  readonly evaluation: ReturnType<typeof createEvaluation>
}

export function evaluationFor(
  terrain: Terrain,
  spec: CourseSpec,
  pool: readonly ControlSiteCandidate[],
  finish: LocalPoint,
  toFinish: Float32Array,
  legSeconds: (from: number, to: number) => number,
  quality: Float32Array,
) {
  const { grid } = terrain
  const { printArea } = spec
  const pace = spec.paceSecondsPerKm ?? REFERENCE_PACE_SECONDS_PER_KM.value
  const staysOnMap = (from: LocalPoint, to: LocalPoint) =>
    courseLineStaysOnMap(grid, terrain.mappedArea, from, to)
  const clearOfDescriptions = (from: LocalPoint, to: LocalPoint) =>
    !printArea || reservedBoxesOf(printArea).every(box => !lineCrossesExtent(from, to, box))
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
    spec.target.winningTime.targetMinutes * 60,
    staysOnMap,
    clearOfDescriptions,
    quality,
    routeChoiceValue,
    mappedAreaWithin(terrain, printArea?.extent ?? null),
  )
  return { evaluation, isAllowedCourseLine, routeChoiceValue }
}

export function assembleCourse(
  { terrain, spec, pool, finish, targetSeconds, evaluation }: CourseContext,
  startIndex: number,
  order: readonly number[],
  withLength: boolean,
): Course {
  const scored = evaluation.score(startIndex, order)
  const stops = [startIndex, ...order].map(i => pool[i]!.position)
  const measured = withLength ? measureCourse(terrain, [...stops, finish]) : null
  const controls = order.map(i => pool[i]!)
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
    printArea: spec.printArea ?? null,
    problems: scored.problems,
    findings: scored.findings,
    breakdown: scored.breakdown,
    score: scored.score,
  }
}

export interface ScoreTerm {
  readonly value: number
  readonly weight: number
  readonly contribution: number
  readonly note: string
}

export interface ScoreBreakdown {
  readonly total: number
  readonly terms: Readonly<Record<ScoreTermName, ScoreTerm>>
}

interface ScoredCourse {
  readonly order: readonly number[]
  readonly legSeconds: readonly number[]
  readonly estimatedSeconds: number
  readonly targetSeconds: number
  readonly problems: CourseProblems
  readonly breakdown: ScoreBreakdown
  readonly findings: readonly Finding[]
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
  usableAreaSquareMetres: number,
) {
  const spacing = controlSpacingForScale(spec.printScale)
  const weights = SCORE_WEIGHTS[spec.format]
  const profile = FORMAT_QUALITY[spec.format]
  const [minDifficulty, maxDifficulty] = spec.target.siteDifficulty

  const score = (startIndex: number, order: readonly number[]): ScoredCourse => {
    const findings: Finding[] = []
    const found = (kind: Finding['kind'], ...stops: number[]) => findings.push({ kind, stops })
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
        if (distance < minimum) {
          spacingProblems++
          found('spacing', a, b)
        }
      }
    }

    let acuteAngleWarnings = 0
    let acuteAngleNotes = 0
    const stops = [...sequence.map(i => pool[i]!.position), finish]
    for (let i = 1; i + 1 < stops.length; i++) {
      const angle = angleAt(stops[i - 1]!, stops[i]!, stops[i + 1]!)
      if (angle < ACUTE_ANGLE.warningBelowDegrees) {
        acuteAngleWarnings++
        found('acuteAngleWarnings', i)
      } else if (angle < ACUTE_ANGLE.noteBelowDegrees) {
        acuteAngleNotes++
        found('acuteAngleNotes', i)
      }
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
    let difficultyOutsideRange = 0
    order.forEach((site, i) => {
      const difficulty = difficultyInCourse(pool[site]!, maxDifficulty)
      if (difficulty < minDifficulty || difficulty > maxDifficulty) {
        difficultyOutsideRange++
        found('difficultyOutsideRange', i + 1)
      }
    })

    const crossings = courseLineCrossings(stops).map(([a, b]) => ({
      a,
      b,
      severity: crossingSeverity(stops[a]!, stops[a + 1]!, stops[b]!, stops[b + 1]!, stops),
    }))
    const badCrossings = crossings.filter(c => c.severity > COURSE_LINE_CROSSING.acceptableSeverity)
    badCrossings.forEach(({ a, b }) => found('courseLineCrossings', a, a + 1, b, b + 1))
    const crossingSeverityTotal = crossings.reduce((sum, c) => sum + c.severity, 0)
    const overlapping = overlappingCircles(stops)
    overlapping.forEach(([a, b]) => found('overlappingCircles', a, b))
    let courseLinesOutsideMap = 0
    let courseLinesOverDescriptions = 0
    for (let i = 0; i + 1 < stops.length; i++) {
      if (!staysOnMap(stops[i]!, stops[i + 1]!)) {
        courseLinesOutsideMap++
        found('courseLinesOutsideMap', i, i + 1)
      }
      if (!clearOfDescriptions(stops[i]!, stops[i + 1]!)) {
        courseLinesOverDescriptions++
        found('courseLinesOverDescriptions', i, i + 1)
      }
    }
    const linesThroughControls = courseLinesThroughControls(stops)
    linesThroughControls.forEach(([leg, control]) =>
      found('courseLinesThroughControls', leg, leg + 1, control),
    )
    const finalLegShare = legSeconds[legSeconds.length - 1]! / targetSeconds
    const finalLegPercentOverLimit = Math.max(
      0,
      100 * (finalLegShare - FINAL_LEG_MAX_SHARE_OF_TARGET),
    )
    if (finalLegPercentOverLimit > 0) found('finalLegTooLong', stops.length - 2, stops.length - 1)

    const { minMinutes, maxMinutes } = spec.target.winningTime
    const outsideRangeSeconds = Math.max(
      0,
      minMinutes * 60 - estimatedSeconds,
      estimatedSeconds - maxMinutes * 60,
    )
    const outsideRangePercent = (100 * outsideRangeSeconds) / targetSeconds
    if (outsideRangePercent > 0) found('winningTimeOutsideRange', 0, sequence.length)
    const problems = {
      spacing: spacingProblems,
      acuteAngleWarnings,
      acuteAngleNotes,
      difficultyOutsideRange,
      courseLineCrossings: badCrossings.length,
      courseLinesThroughControls: linesThroughControls.length,
      courseLinesOutsideMap,
      courseLinesOverDescriptions,
      overlappingCircles: overlapping.length,
      finalLegTooLong: finalLegPercentOverLimit > 0,
      winningTimeOutsideRange: outsideRangePercent > 0,
      controlsWithoutFeature: 0,
    }
    const timeErrorPercent = (100 * Math.abs(estimatedSeconds - targetSeconds)) / targetSeconds
    const isUnreachable = !Number.isFinite(estimatedSeconds)
    const term = (name: ScoreTermName, value: number, note: string): ScoreTerm => ({
      value,
      weight: weights[name],
      contribution: value * weights[name],
      note,
    })
    const count = (n: number, what: string) => `${n} ${what}`
    const terms: Record<ScoreTermName, ScoreTerm> = {
      timeErrorPerPercent: term(
        'timeErrorPerPercent',
        timeErrorPercent,
        `estimated ${Math.round(estimatedSeconds / 60)} min, target ${Math.round(targetSeconds / 60)} min`,
      ),
      timeOutsideRangePerPercent: term(
        'timeOutsideRangePerPercent',
        outsideRangePercent,
        outsideRangePercent > 0
          ? `outside the class's ${minMinutes}–${maxMinutes} min`
          : `within ${minMinutes}–${maxMinutes} min`,
      ),
      spacing: term('spacing', spacingProblems, count(spacingProblems, 'pairs too close')),
      acuteAngleWarning: term(
        'acuteAngleWarning',
        acuteAngleWarnings,
        count(acuteAngleWarnings, 'sharp angles'),
      ),
      acuteAngleNote: term(
        'acuteAngleNote',
        acuteAngleNotes,
        count(acuteAngleNotes, 'angles under 60°'),
      ),
      difficultyOutsideRange: term(
        'difficultyOutsideRange',
        difficultyOutsideRange,
        count(difficultyOutsideRange, "controls off the class's difficulty"),
      ),
      courseLineCrossing: term(
        'courseLineCrossing',
        crossingSeverityTotal,
        `${crossings.length} crossings, ${badCrossings.length} near a control or at a shallow angle`,
      ),
      courseLineThroughControl: term(
        'courseLineThroughControl',
        linesThroughControls.length,
        count(linesThroughControls.length, 'lines through circles'),
      ),
      finalLegPerPercentOverLimit: term(
        'finalLegPerPercentOverLimit',
        finalLegPercentOverLimit,
        `last leg ${Math.round(finalLegShare * 100)}% of the winning time`,
      ),
      courseLineOutsideMap: term(
        'courseLineOutsideMap',
        courseLinesOutsideMap,
        count(courseLinesOutsideMap, 'lines off the map'),
      ),
      courseLineOverDescriptions: term(
        'courseLineOverDescriptions',
        courseLinesOverDescriptions,
        count(courseLinesOverDescriptions, 'lines under the descriptions'),
      ),
      overlappingCircles: term(
        'overlappingCircles',
        overlapping.length,
        count(overlapping.length, 'overlapping circles'),
      ),
      areaQuality: term(
        'areaQuality',
        -meanQuality,
        `mean terrain quality ${meanQuality.toFixed(2)}`,
      ),
      routeChoicePerKeyLeg: term(
        'routeChoicePerKeyLeg',
        -routeChoiceTotal,
        `route-choice value ${routeChoiceTotal.toFixed(1)} on the key legs`,
      ),
      ...shapeTerms(stops),
    }
    const total = Object.values(terms).reduce((sum, t) => sum + t.contribution, 0)
    // NaN would lose every comparison silently and freeze the search.
    const score = isUnreachable || Number.isNaN(total) ? Number.POSITIVE_INFINITY : total
    return {
      order,
      legSeconds,
      estimatedSeconds,
      targetSeconds,
      problems,
      breakdown: { total: score, terms },
      findings,
      score,
    }
  }

  const shapeTerms = (stops: readonly LocalPoint[]) => {
    const asTerm = (name: ScoreTermName, metric: Metric): ScoreTerm => ({
      value: metric.value,
      weight: weights[name],
      contribution: metric.value * weights[name],
      note: metric.note,
    })
    return {
      legCount: asTerm('legCount', legCount(stops, profile.legLengths)),
      parallelLegs: asTerm('parallelLegs', parallelLegs(stops)),
      closeness: asTerm('closeness', closeness(stops)),
      reversals: asTerm('reversals', reversals(stops)),
      ring: asTerm('ring', ring(stops)),
      legLengths: asTerm('legLengths', legLengthDistribution(stops, profile.legLengths)),
      alternation: asTerm('alternation', alternation(stops)),
      directionChanges: asTerm(
        'directionChanges',
        directionChanges(stops, profile.directionChangeRateTarget),
      ),
      firstLeg: asTerm('firstLeg', firstLegTowardsFinish(stops)),
      spread: asTerm('spread', spread(stops, usableAreaSquareMetres, profile.spreadTarget)),
    }
  }

  return { score }
}

function densestCore(
  candidates: readonly ControlSiteCandidate[],
  qualityOf: SiteQualityOf,
): LocalPoint | null {
  let best: LocalPoint | null = null
  let bestTotal = -1
  for (const centre of candidates) {
    let total = 0
    for (const other of candidates) {
      if (distanceBetween(centre.position, other.position) <= MIDDLE_CORE_RADIUS_METERS) {
        total += qualityOf(other)
      }
    }
    if (total > bestTotal) {
      bestTotal = total
      best = centre.position
    }
  }
  return best
}

function pickStart(
  pool: readonly ControlSiteCandidate[],
  toFinish: Float32Array,
  targetSeconds: number,
  waypoints: readonly LocalPoint[],
  finish: LocalPoint,
  core: LocalPoint | null,
  wishedDistance: readonly [number, number] | null,
  random: Random,
): number {
  const [nearShare, farShare] = START_DISTANCE_FROM_FINISH
  const metresOutsideWish = (i: number) => {
    if (!wishedDistance) return 0
    const distance = distanceBetween(pool[i]!.position, finish)
    return Math.max(0, wishedDistance[0] - distance, distance - wishedDistance[1])
  }
  const fitsDistance = (i: number) =>
    wishedDistance
      ? metresOutsideWish(i) === 0
      : toFinish[i]! >= nearShare * targetSeconds && toFinish[i]! <= farShare * targetSeconds
  const reachable = (i: number) => Number.isFinite(toFinish[i]!)
  const sitesUpTo = (maxDifficulty: number) =>
    pool.flatMap((site, i) =>
      site.technicalDifficulty <= maxDifficulty && reachable(i) ? [i] : [],
    )
  if (core) {
    const inCore = sitesUpTo(MAX_START_DIFFICULTY).filter(
      i => fitsDistance(i) && distanceBetween(pool[i]!.position, core) <= MIDDLE_CORE_RADIUS_METERS,
    )
    const start = random.pick(inCore)
    if (start !== undefined) return start
  }
  const firstWaypoint = waypoints[0]
  const towardsFirstWaypoint = (site: ControlSiteCandidate) => {
    if (!firstWaypoint) return 0
    const ax = site.position[0] - finish[0]
    const ay = site.position[1] - finish[1]
    const bx = firstWaypoint[0] - finish[0]
    const by = firstWaypoint[1] - finish[1]
    return (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1)
  }
  const easy = sitesUpTo(MAX_START_DIFFICULTY)
  const inRange = easy.filter(fitsDistance)
  const pickable =
    inRange.length > 0 ? inRange : sitesUpTo(MAX_SITE_DIFFICULTY).filter(fitsDistance)
  if (pickable.length === 0) {
    // No site meets the user's wish, so the start comes as near to it as the map allows.
    if (!wishedDistance || easy.length === 0) return NO_SITE
    return easy.reduce((a, b) => (metresOutsideWish(b) < metresOutsideWish(a) ? b : a))
  }
  const preference = (i: number) =>
    START_TOWARDS_WAYPOINT_PREFERENCE * towardsFirstWaypoint(pool[i]!) + random.next()
  return pickable.reduce((a, b) => (preference(b) > preference(a) ? b : a))
}

function buildGreedy(
  startIndex: number,
  pool: readonly ControlSiteCandidate[],
  toFinish: Float32Array,
  timesFrom: (poolIndex: number) => Float32Array,
  targetSeconds: number,
  spec: CourseSpec,
  waypoints: readonly LocalPoint[],
  finish: LocalPoint,
  staysOnMap: (from: LocalPoint, to: LocalPoint) => boolean,
  quality: Float32Array,
  routeChoiceValue: (from: LocalPoint, to: LocalPoint, fastestSeconds: number) => number,
  random: Random,
): number[] {
  const profile = LEG_PROFILES[spec.format]
  const formatQuality = FORMAT_QUALITY[spec.format]
  const { binEdgesMetres: edges, shares } = formatQuality.legLengths
  const legCounts = new Array<number>(edges.length - 1).fill(0)
  const expectedLegs = expectedControlCount(spec.format) + 1
  const binOf = (metres: number) => {
    const bin = edges.findIndex((edge, i) => i > 0 && metres < edge) - 1
    return bin < 0 ? legCounts.length - 1 : bin
  }
  const pickLegBin = () => {
    const deficits = shares.map((share, bin) => Math.max(0, share * expectedLegs - legCounts[bin]!))
    const weights = deficits.some(d => d > 0) ? deficits : shares
    const total = weights.reduce((sum, w) => sum + w, 0)
    let pick = random.next() * total
    return Math.max(
      0,
      weights.findIndex(w => (pick -= w) <= 0),
    )
  }
  let nextWaypoint = 0
  const [minDifficulty, maxDifficulty] = spec.target.siteDifficulty
  const spacing = controlSpacingForScale(spec.printScale)
  const order: number[] = []
  let current = startIndex
  let previous = NO_SITE
  let elapsed = 0
  const banned = new Set<number>()
  let backtracks = 0
  const legSecondsAt = (k: number) => timesFrom(k === 0 ? startIndex : order[k - 1]!)[order[k]!]!

  for (;;) {
    const remaining = targetSeconds - elapsed
    const shortestLeg = profile.shortLeg[0] * targetSeconds
    const finalLegMax = FINAL_LEG_MAX_SHARE_OF_TARGET * targetSeconds
    if (remaining - toFinish[current]! < shortestLeg) break

    const bin = pickLegBin()
    const low = edges[bin]!
    const high = edges[bin + 1]!
    const isLongLeg = low >= LONG_LEG_FROM_METRES
    const times = timesFrom(current)
    const from = pool[current]!.position
    const waypoint = waypoints[nextWaypoint] ?? null
    const toWaypoint = waypoint ? distanceBetween(from, waypoint) : 0
    const used = new Set([startIndex, ...order, ...banned])
    const anyLength: readonly [number, number] = [edges[0]!, edges[edges.length - 1]!]
    const fits = (
      i: number,
      [shortest, longest]: readonly [number, number],
      keepToWaypoint: boolean,
    ) => {
      const t = times[i]!
      const site = pool[i]!
      const straight = distanceBetween(from, site.position)
      if (used.has(i) || straight < shortest || straight > longest) return false
      if (t + toFinish[i]! > remaining) return false
      if (
        keepToWaypoint &&
        waypoint &&
        distanceBetween(site.position, waypoint) >
          toWaypoint + MAX_DETOUR_FROM_WAYPOINT_SHARE_OF_LEG * straight
      ) {
        return false
      }
      const wouldBeLastControl = remaining - t - toFinish[i]! < shortestLeg
      if (wouldBeLastControl && toFinish[i]! > finalLegMax) return false
      const isNearHome = remaining - t < HEADING_HOME_SHARE_OF_TARGET * targetSeconds
      if (isNearHome || wouldBeLastControl) {
        const earlierStops = [startIndex, ...order].map(u => pool[u]!.position)
        for (let k = 0; k + 1 < earlierStops.length; k++) {
          if (
            crossingSeverity(earlierStops[k]!, earlierStops[k + 1]!, site.position, finish, [
              ...earlierStops,
              site.position,
              finish,
            ]) > COURSE_LINE_CROSSING.acceptableSeverity
          ) {
            return false
          }
        }
      }
      if (wouldBeLastControl) {
        if (
          angleAt(pool[current]!.position, site.position, finish) < ACUTE_ANGLE.noteBelowDegrees
        ) {
          return false
        }
        if (!staysOnMap(site.position, finish)) return false
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
      for (let k = 0; k + 1 < stops.length - 1; k++) {
        const severity = crossingSeverity(stops[k]!, stops[k + 1]!, from, site.position, [
          ...stops,
          site.position,
        ])
        if (severity > COURSE_LINE_CROSSING.acceptableSeverity) return false
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
    const fitting = (
      band: readonly [number, number],
      inRangeOnly: boolean,
      keepToWaypoint: boolean,
    ) =>
      pool.flatMap((_, i) =>
        (!inRangeOnly || isInDifficultyRange(i)) && fits(i, band, keepToWaypoint) ? [i] : [],
      )
    const widened = [low / WIDER_LEG_BAND, high * WIDER_LEG_BAND] as const
    let candidates = fitting([low, high], true, true)
    if (candidates.length === 0) candidates = fitting(widened, true, true)
    if (candidates.length === 0) candidates = fitting(anyLength, true, true)
    if (candidates.length === 0) {
      candidates = fitting(anyLength, false, false)
      if (waypoint) nextWaypoint++
    }
    if (candidates.length === 0) {
      // Dead end: take back the last control, never use it again, and carry on from before it.
      if (backtracks >= MAX_BACKTRACKS || order.length === 0) break
      backtracks++
      const last = order.pop()!
      banned.add(last)
      const lastFrom = order.length === 0 ? startIndex : order[order.length - 1]!
      legCounts[binOf(distanceBetween(pool[lastFrom]!.position, pool[last]!.position))]!--
      elapsed = order.reduce((sum, _, k) => sum + legSecondsAt(k), 0)
      current = lastFrom
      previous =
        order.length >= 2 ? order[order.length - 2]! : order.length === 1 ? startIndex : NO_SITE
      continue
    }

    const isHeadingHome = remaining < HEADING_HOME_SHARE_OF_TARGET * targetSeconds
    const preference = (i: number) => {
      const difficulty = difficultyInCourse(pool[i]!, maxDifficulty)
      const inRange = difficulty >= minDifficulty && difficulty <= maxDifficulty
      const closerToFinish = isHeadingHome ? 2 * (1 - toFinish[i]! / remaining) : 0
      const position = pool[i]!.position
      const progress = waypoint
        ? Math.max(
            -1,
            Math.min(
              1,
              (toWaypoint - distanceBetween(position, waypoint)) /
                Math.max(1, distanceBetween(from, position)),
            ),
          )
        : 0
      return (
        random.next() +
        (inRange ? 1 : 0) +
        closerToFinish +
        WAYPOINT_PREFERENCE * progress +
        QUALITY_PREFERENCE * quality[i]! +
        (isLongLeg
          ? ROUTE_CHOICE_PREFERENCE *
            routeChoiceValue(pool[current]!.position, pool[i]!.position, times[i]!)
          : 0)
      )
    }
    const next = candidates.reduce((a, b) => (preference(b) > preference(a) ? b : a))
    legCounts[binOf(distanceBetween(from, pool[next]!.position))]!++
    while (
      waypoints[nextWaypoint] &&
      distanceBetween(pool[next]!.position, waypoints[nextWaypoint]!) <=
        formatQuality.waypoints.reachedWithinMetres
    ) {
      nextWaypoint++
    }
    order.push(next)
    elapsed += times[next]!
    previous = current
    current = next
  }

  // The build can stop where nothing more fits, after a control that was never checked as the
  // last one. If its line into the finish is not clean, put the best clean site there instead.
  function closeCleanly(course: number[]) {
    const stopsOf = (indices: readonly number[]) =>
      [startIndex, ...indices].map(u => pool[u]!.position)
    const endsCleanly = (indices: readonly number[]) => {
      const stops = stopsOf(indices)
      const last = stops[stops.length - 1]!
      const beforeLast = stops[stops.length - 2]
      const beforeThat = stops[stops.length - 3]
      if (distanceBetween(last, finish) < FINISH_CLEARANCE_METERS) return false
      const keepsApart = stops
        .slice(0, -1)
        .every(
          stop =>
            distanceBetween(stop, last) >=
            Math.max(
              spacing.minStraightMetersForSimilarSites,
              2 * CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS,
            ),
        )
      if (!keepsApart) return false
      if (beforeLast && angleAt(beforeLast, last, finish) < ACUTE_ANGLE.noteBelowDegrees)
        return false
      if (
        beforeThat &&
        beforeLast &&
        angleAt(beforeThat, beforeLast, last) < ACUTE_ANGLE.noteBelowDegrees
      ) {
        return false
      }
      for (let k = 0; k + 2 < stops.length; k++) {
        if (segmentsCross(stops[k]!, stops[k + 1]!, last, finish)) return false
        if (k + 3 < stops.length && segmentsCross(stops[k]!, stops[k + 1]!, beforeLast!, last))
          return false
      }
      return stops
        .slice(0, -1)
        .every(
          stop =>
            distanceToSegment(stop, last, finish) >= CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS &&
            (stop === beforeLast ||
              !beforeLast ||
              distanceToSegment(stop, beforeLast, last) >= CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS),
        )
    }
    if (course.length === 0 || endsCleanly(course)) return
    const kept = course.slice(0, -1)
    const previous = kept.length > 0 ? kept[kept.length - 1]! : startIndex
    const fromPrevious = timesFrom(previous)
    const used = new Set([startIndex, ...kept])
    const elapsedBefore = kept.reduce(
      (sum, site, i) => sum + timesFrom(i === 0 ? startIndex : kept[i - 1]!)[site]!,
      0,
    )
    let best: { site: number; error: number } | null = null
    pool.forEach((_, site) => {
      if (used.has(site)) return
      const total = elapsedBefore + fromPrevious[site]! + toFinish[site]!
      if (!Number.isFinite(total)) return
      const error = Math.abs(targetSeconds - total)
      if (best && error >= best.error) return
      if (!endsCleanly([...kept, site])) return
      best = { site, error }
    })
    if (best) course.splice(course.length - 1, 1, (best as { site: number }).site)
  }
  closeCleanly(order)
  return order
}

function proposeChange(
  startIndex: number,
  order: readonly number[],
  pool: readonly ControlSiteCandidate[],
  toFinish: Float32Array,
  timesFrom: (poolIndex: number) => Float32Array,
  current: ScoredCourse,
  finish: LocalPoint,
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
  const flaggedPositions = current.findings
    .flatMap(finding => finding.stops)
    .map(stop => Math.min(stop, order.length) - 1)
    .filter(position => position >= 0)
  const position =
    flaggedPositions.length > 0 && random.next() < TARGET_FLAGGED_CONTROL_CHANCE
      ? random.pick(flaggedPositions)!
      : Math.floor(random.next() * order.length)

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
  const stops = [startIndex, ...order].map(i => pool[i]!.position)
  const next = position + 1 < order.length ? pool[order[position + 1]!]!.position : finish
  // Legs that stay when the control at `position` is replaced (or a control inserted before it).
  const keepsClear = (candidate: LocalPoint, replacing: boolean) => {
    const before = stops[position]!
    const after = replacing ? next : (stops[position + 1] ?? finish)
    const skipFrom = position
    const skipTo = replacing ? position + 1 : position
    for (let k = 0; k + 1 < stops.length; k++) {
      if (k >= skipFrom && k <= skipTo) continue
      const a = stops[k]!
      const b = stops[k + 1]!
      const near = [...stops, candidate, finish]
      if (
        Math.max(
          crossingSeverity(a, b, before, candidate, near),
          crossingSeverity(a, b, candidate, after, near),
        ) > COURSE_LINE_CROSSING.acceptableSeverity
      ) {
        return false
      }
    }
    if (distanceBetween(candidate, finish) < FINISH_CLEARANCE_METERS) return false
    const replaced = replacing ? position + 1 : -1
    const tooClose = stops.some(
      (stop, k) =>
        k !== replaced && distanceBetween(stop, candidate) < MIN_CONTROL_SEPARATION_METERS,
    )
    if (tooClose) return false
    const sequence = [...stops, finish]
    const beforeThat = sequence[position - 1]
    const afterThat = sequence[replacing ? position + 3 : position + 2]
    const minimumAngle = ACUTE_ANGLE.noteBelowDegrees
    if (beforeThat && angleAt(beforeThat, before, candidate) < minimumAngle) return false
    if (angleAt(before, candidate, after) < minimumAngle) return false
    if (afterThat && angleAt(candidate, after, afterThat) < minimumAngle) return false
    return true
  }
  const candidatesWithin = (lowShare: number, highShare: number, replacing = true) =>
    pool.flatMap((site, i) => {
      const t = fromPrevious[i]!
      return !used.has(i) &&
        t >= legSeconds * lowShare &&
        t <= legSeconds * highShare &&
        keepsClear(site.position, replacing)
        ? [i]
        : []
    })

  if (isTooShort && random.next() < LENGTH_CHANGE_CHANCE) {
    const inserted = random.pick(candidatesWithin(...INSERT_LEG_TIME_RANGE, false))
    if (inserted !== undefined)
      return [...order.slice(0, position), inserted, ...order.slice(position)]
  }

  if (random.next() < SHIFT_CHANCE) {
    const here = pool[order[position]!]!.position
    const nearby = pool.flatMap((site, i) =>
      !used.has(i) &&
      distanceBetween(site.position, here) <= SHIFT_RADIUS_METERS &&
      keepsClear(site.position, true)
        ? [i]
        : [],
    )
    const shifted = random.pick(nearby)
    if (shifted !== undefined) {
      const changed = [...order]
      changed[position] = shifted
      return changed
    }
  }

  const replacement = random.pick(candidatesWithin(...SWAP_LEG_TIME_RANGE))
  if (replacement === undefined) return null
  const changed = [...order]
  changed[position] = replacement
  return changed
}

// Moves are not all checked for geometry, so never accept one that makes the course harder to read.
const addsLineProblems = (before: CourseProblems, after: CourseProblems) =>
  after.courseLineCrossings > before.courseLineCrossings ||
  after.courseLinesThroughControls > before.courseLinesThroughControls ||
  after.acuteAngleWarnings > before.acuteAngleWarnings

const HARD_RULES: ReadonlySet<Finding['kind']> = new Set(['spacing', 'overlappingCircles'])

// The random moves usually clear a broken hard rule, but not always; try every nearby site for
// each control involved before giving up.
function repairHardRules(
  startIndex: number,
  scored: ScoredCourse,
  pool: readonly ControlSiteCandidate[],
  evaluation: ReturnType<typeof createEvaluation>,
): readonly number[] {
  let current = scored
  const involved = new Set(
    current.findings
      .filter(finding => HARD_RULES.has(finding.kind))
      .flatMap(finding => finding.stops)
      .filter(stop => stop >= 1 && stop <= current.order.length),
  )
  for (const stop of involved) {
    const position = stop - 1
    const here = pool[current.order[position]!]!.position
    const used = new Set([startIndex, ...current.order])
    pool.forEach((site, i) => {
      if (used.has(i) || distanceBetween(site.position, here) > HARD_RULE_REPAIR_RADIUS_METERS)
        return
      const replaced = current.order.map((siteIndex, k) => (k === position ? i : siteIndex))
      const candidate = evaluation.score(startIndex, replaced)
      if (candidate.score < current.score) current = candidate
    })
  }
  return current.order
}

// Doglegs need the actual routes, which are too slow to compute at every search step, so the
// finished course is checked once and each doubling-back control moved to a nearby site.
function repairDoglegs(
  startIndex: number,
  order: readonly number[],
  pool: readonly ControlSiteCandidate[],
  finish: LocalPoint,
  grid: CostGrid,
  paceSecondsPerKm: number,
  evaluation: ReturnType<typeof createEvaluation>,
): readonly number[] {
  const routes = new Map<string, readonly LocalPoint[]>()
  const routeBetween = (from: LocalPoint, to: LocalPoint): readonly LocalPoint[] => {
    const key = `${from[0]},${from[1]},${to[0]},${to[1]}`
    const cached = routes.get(key)
    if (cached) return cached
    const route = findRoute(grid, from, to, { paceSecondsPerKm })?.points ?? [from, to]
    routes.set(key, route)
    return route
  }
  const doublesBack = (before: LocalPoint, at: LocalPoint, after: LocalPoint) =>
    routeDoglegOverlaps([routeBetween(before, at), routeBetween(at, after)])[0]! >
    COURSE_SHAPE.doglegHardOverlap

  let current = order
  for (let position = 0; position < current.length; position++) {
    const positionOf = (sequence: readonly number[], k: number) =>
      k < 0
        ? pool[startIndex]!.position
        : k >= sequence.length
          ? finish
          : pool[sequence[k]!]!.position
    const before = positionOf(current, position - 1)
    const here = positionOf(current, position)
    const after = positionOf(current, position + 1)
    if (!doublesBack(before, here, after)) continue
    const used = new Set([startIndex, ...current])
    const keepScore = evaluation.score(startIndex, current).score
    let best: { order: number[]; score: number } | null = null
    pool.forEach((site, i) => {
      if (used.has(i) || distanceBetween(site.position, here) > DOGLEG_REPAIR_RADIUS_METERS) return
      if (doublesBack(before, site.position, after)) return
      const replaced = current.map((siteIndex, k) => (k === position ? i : siteIndex))
      const { score } = evaluation.score(startIndex, replaced)
      if (!best || score < best.score) best = { order: replaced, score }
    })
    const chosen = best as { order: number[]; score: number } | null
    if (chosen && chosen.score < keepScore + DOGLEG_WORTH) current = chosen.order
  }
  return current
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

type Pair = [number, number]

function courseLineCrossings(stops: readonly LocalPoint[]): Pair[] {
  const crossings: Pair[] = []
  for (let a = 0; a + 1 < stops.length; a++) {
    for (let b = a + 2; b + 1 < stops.length; b++) {
      if (segmentsCross(stops[a]!, stops[a + 1]!, stops[b]!, stops[b + 1]!)) crossings.push([a, b])
    }
  }
  return crossings
}

function courseLinesThroughControls(stops: readonly LocalPoint[]): Pair[] {
  const throughControls: Pair[] = []
  for (let leg = 0; leg + 1 < stops.length; leg++) {
    for (let control = 1; control < stops.length - 1; control++) {
      if (control === leg || control === leg + 1) continue
      const distance = distanceToSegment(stops[control]!, stops[leg]!, stops[leg + 1]!)
      if (distance < CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS) throughControls.push([leg, control])
    }
  }
  return throughControls
}

function overlappingCircles(stops: readonly LocalPoint[]): Pair[] {
  const radiusOf = (i: number) =>
    i === stops.length - 1
      ? FINISH_OUTER_CIRCLE_FOOTPRINT_RADIUS_METERS
      : CONTROL_CIRCLE_FOOTPRINT_RADIUS_METERS
  const overlapping: Pair[] = []
  for (let a = 0; a < stops.length; a++) {
    for (let b = a + 1; b < stops.length; b++) {
      if (distanceBetween(stops[a]!, stops[b]!) < radiusOf(a) + radiusOf(b))
        overlapping.push([a, b])
    }
  }
  return overlapping
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
