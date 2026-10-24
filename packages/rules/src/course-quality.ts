import { z } from 'zod'
import { citedSchema, iofRules, ratamestarikirja } from './source'
import type { Format } from './winning-time'

export const courseShapeRuleSchema = citedSchema.extend({
  reversalDegrees: z.number().positive(),
  reversalReferenceLegMetres: z.number().positive(),
  directionChangeDegrees: z.number().positive(),
  alternationLengthRatio: z.number().min(1),
  alternationRunLength: z.int().min(2),
  firstLegTowardsFinishDegrees: z.number().positive(),
  doglegLengthMetres: z.number().positive(),
  doglegWidthMetres: z.number().positive(),
  doglegHardOverlap: z.number().min(0).max(1),
})

export type CourseShapeRule = z.infer<typeof courseShapeRuleSchema>

export const COURSE_SHAPE: CourseShapeRule = {
  reversalDegrees: 150,
  reversalReferenceLegMetres: 500,
  directionChangeDegrees: 60,
  alternationLengthRatio: 1.3,
  alternationRunLength: 3,
  firstLegTowardsFinishDegrees: 30,
  doglegLengthMetres: 75,
  doglegWidthMetres: 15,
  doglegHardOverlap: 0.6,
  sources: [
    iofRules('App. 2 §3.4.1'),
    iofRules('App. 2 §3.5.4'),
    ratamestarikirja('1.3.1'),
    ratamestarikirja('4.5.S'),
  ],
  interpretation: true,
}

export const legLengthTargetSchema = citedSchema.extend({
  binEdgesMetres: z.array(z.number().nonnegative()).min(2),
  shares: z.array(z.number().nonnegative()),
})

export const formatQualityProfileSchema = citedSchema.extend({
  legLengths: legLengthTargetSchema,
  directionChangeRateTarget: z.number().min(0).max(1),
  spreadTarget: z.number().min(0).max(1),
})

export type LegLengthTarget = z.infer<typeof legLengthTargetSchema>
export type FormatQualityProfile = z.infer<typeof formatQualityProfileSchema>

const LEG_BIN_EDGES_METRES = [0, 150, 300, 500, 800, 1200, 2000, 3500]

export const FORMAT_QUALITY: Readonly<Record<Format, FormatQualityProfile>> = {
  long: {
    legLengths: {
      binEdgesMetres: LEG_BIN_EDGES_METRES,
      shares: [0.05, 0.15, 0.2, 0.2, 0.15, 0.15, 0.1],
      sources: [iofRules('App. 2 §3.4.1'), ratamestarikirja('2.S.1')],
      interpretation: true,
    },
    directionChangeRateTarget: 0.6,
    spreadTarget: 0.5,
    sources: [ratamestarikirja('2.S.1'), iofRules('App. 2 §3.4.1')],
    interpretation: true,
  },
  middle: {
    legLengths: {
      binEdgesMetres: LEG_BIN_EDGES_METRES,
      shares: [0.25, 0.35, 0.25, 0.1, 0.05, 0, 0],
      sources: [iofRules('App. 2 §3.4.1'), ratamestarikirja('2.S.2')],
      interpretation: true,
    },
    directionChangeRateTarget: 0.75,
    spreadTarget: 0.4,
    sources: [ratamestarikirja('2.S.2'), iofRules('App. 2 §3.4.1')],
    interpretation: true,
  },
}

export const scoreWeightsSchema = citedSchema.extend({
  timeErrorPerPercent: z.number().nonnegative(),
  spacing: z.number().nonnegative(),
  acuteAngleWarning: z.number().nonnegative(),
  acuteAngleNote: z.number().nonnegative(),
  difficultyOutsideRange: z.number().nonnegative(),
  courseLineCrossing: z.number().nonnegative(),
  courseLineThroughControl: z.number().nonnegative(),
  finalLegPerPercentOverLimit: z.number().nonnegative(),
  courseLineOutsideMap: z.number().nonnegative(),
  courseLineOverDescriptions: z.number().nonnegative(),
  overlappingCircles: z.number().nonnegative(),
  areaQuality: z.number().nonnegative(),
  routeChoicePerKeyLeg: z.number().nonnegative(),
  reversals: z.number().nonnegative(),
  ring: z.number().nonnegative(),
  legLengths: z.number().nonnegative(),
  alternation: z.number().nonnegative(),
  directionChanges: z.number().nonnegative(),
  firstLeg: z.number().nonnegative(),
  spread: z.number().nonnegative(),
})

export type ScoreWeights = z.infer<typeof scoreWeightsSchema>
export type ScoreTermName = Exclude<keyof ScoreWeights, 'sources' | 'interpretation'>

const RULE_PENALTIES = {
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
}

const WEIGHT_SOURCES = [
  iofRules('App. 2 §3.4.1'),
  ratamestarikirja('1.2.6.S'),
  ratamestarikirja('2.S.1'),
  ratamestarikirja('2.S.2'),
]

export const SCORE_WEIGHTS: Readonly<Record<Format, ScoreWeights>> = {
  long: {
    ...RULE_PENALTIES,
    areaQuality: 20,
    routeChoicePerKeyLeg: 8,
    reversals: 15,
    ring: 25,
    legLengths: 60,
    alternation: 20,
    directionChanges: 20,
    firstLeg: 5,
    spread: 20,
    sources: WEIGHT_SOURCES,
    interpretation: true,
  },
  middle: {
    ...RULE_PENALTIES,
    areaQuality: 40,
    routeChoicePerKeyLeg: 0,
    reversals: 10,
    ring: 15,
    legLengths: 60,
    alternation: 20,
    directionChanges: 40,
    firstLeg: 5,
    spread: 10,
    sources: WEIGHT_SOURCES,
    interpretation: true,
  },
}
