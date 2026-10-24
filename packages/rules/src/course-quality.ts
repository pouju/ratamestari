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
