import { z } from 'zod'
import { citedSchema, iofRules, isom, lajisaannot, ratamestarikirja } from './source'

export const controlSpacingRuleSchema = citedSchema.extend({
  minStraightMeters: z.number().positive(),
  minStraightMetersForSimilarSites: z.number().positive(),
  minRunningMeters: z.number().positive().nullable(),
})

export const controlCodeRuleSchema = citedSchema.extend({
  min: z.int(),
  max: z.int(),
  excluded: z.array(z.int()),
})

export const acuteAngleRuleSchema = citedSchema.extend({
  warningBelowDegrees: z.number().positive(),
  noteBelowDegrees: z.number().positive(),
})

export const climbRuleSchema = citedSchema.extend({
  maxClimbPerShortestRouteLength: z.number().positive(),
})

export type ControlSpacingRule = z.infer<typeof controlSpacingRuleSchema>
export type ControlCodeRule = z.infer<typeof controlCodeRuleSchema>
export type AcuteAngleRule = z.infer<typeof acuteAngleRuleSchema>
export type ClimbRule = z.infer<typeof climbRuleSchema>

export const FOREST_CONTROL_SPACING: ControlSpacingRule = {
  minStraightMeters: 30,
  minStraightMetersForSimilarSites: 60,
  minRunningMeters: null,
  sources: [lajisaannot('11.41')],
  interpretation: false,
}

export const SPRINT_CONTROL_SPACING: ControlSpacingRule = {
  minStraightMeters: 15,
  minStraightMetersForSimilarSites: 30,
  minRunningMeters: 25,
  sources: [lajisaannot('11.411')],
  interpretation: false,
}

const LARGEST_SPRINT_SCALE_DENOMINATOR = 5000

export const controlSpacingForScale = (scale: number): ControlSpacingRule =>
  scale <= LARGEST_SPRINT_SCALE_DENOMINATOR ? SPRINT_CONTROL_SPACING : FOREST_CONTROL_SPACING

export const CONTROL_CODES: ControlCodeRule = {
  min: 31,
  max: 599,
  excluded: [66, 68, 86, 89, 98, 99, 161, 191],
  sources: [lajisaannot('11.46')],
  interpretation: false,
}

export const isAllowedControlCode = (code: number): boolean =>
  Number.isInteger(code) &&
  code >= CONTROL_CODES.min &&
  code <= CONTROL_CODES.max &&
  !CONTROL_CODES.excluded.includes(code)

export const ACUTE_ANGLE: AcuteAngleRule = {
  warningBelowDegrees: 45,
  noteBelowDegrees: 60,
  sources: [ratamestarikirja('1.3.1'), ratamestarikirja('4.5.S'), iofRules('App. 2 §3.5.4')],
  interpretation: true,
}

export const CLIMB: ClimbRule = {
  maxClimbPerShortestRouteLength: 0.04,
  sources: [iofRules('App. 2 §3.11.6')],
  interpretation: false,
}

export const controlCircleRuleSchema = citedSchema.extend({
  footprintMeters: z.number().positive(),
})

export type ControlCircleRule = z.infer<typeof controlCircleRuleSchema>

export const CONTROL_CIRCLE: ControlCircleRule = {
  footprintMeters: 75,
  sources: [isom('sym. 703')],
  interpretation: false,
}

// Checks across the courses of one event (D27, rules digest › Several courses in one event).
export const eventCheckSchema = citedSchema.extend({
  severity: z.enum(['error', 'warning', 'note']),
})
export type EventCheck = z.infer<typeof eventCheckSchema>

export const EVENT_CHECKS = {
  controlsTooClose: {
    severity: 'error',
    sources: [lajisaannot('11.41'), iofRules('19.4'), iofRules('App. 2 §3.5.5')],
    interpretation: false,
  },
  similarControlsClose: {
    severity: 'warning',
    sources: [lajisaannot('11.41'), iofRules('19.4')],
    interpretation: false,
  },
  similarCodesNear: {
    severity: 'note',
    sources: [ratamestarikirja('4.5.S')],
    interpretation: true,
  },
  legSharedByCourses: {
    severity: 'note',
    sources: [ratamestarikirja('1.4.1'), iofRules('App. 2 §3.8')],
    interpretation: true,
  },
  legRunBothWays: {
    severity: 'note',
    sources: [ratamestarikirja('4.5.S')],
    interpretation: true,
  },
} as const satisfies Record<string, EventCheck>

export type EventCheckKind = keyof typeof EVENT_CHECKS

// Interpretation: "neighbouring" controls (RMK 4.5.S) are those within this distance.
export const SIMILAR_CODES_NEAR_METERS = 200

// Codes that are easy to mix up: consecutive numbers, or the same last two digits (RMK 4.5.S).
export const areSimilarCodes = (a: number, b: number): boolean =>
  a !== b && (Math.abs(a - b) === 1 || a % 100 === b % 100)
