import { z } from 'zod'
import { citedSchema, isom, ratamestarikirja } from './source'

export const leadingFeatureRuleSchema = citedSchema.extend({
  lineIsomCodes: z.array(z.string()),
  areaOutlineIsomCodes: z.array(z.string()),
})

export const controlSiteDifficultyRuleSchema = citedSchema.extend({
  onLeadingFeatureMaxMeters: z.number().positive(),
  nearLeadingFeatureMaxMeters: z.number().positive(),
})

export type LeadingFeatureRule = z.infer<typeof leadingFeatureRuleSchema>
export type ControlSiteDifficultyRule = z.infer<typeof controlSiteDifficultyRuleSchema>

export const LEADING_FEATURES: LeadingFeatureRule = {
  lineIsomCodes: [
    '502',
    '503',
    '504',
    '505',
    '506',
    '507',
    '508',
    '510',
    '511',
    '304',
    '305',
    '306',
    '415',
    '416',
  ],
  areaOutlineIsomCodes: ['401', '402', '403', '404'],
  sources: [ratamestarikirja('11'), ratamestarikirja('1.2.5')],
  interpretation: true,
}

export const CONTROL_SITE_DIFFICULTY: ControlSiteDifficultyRule = {
  onLeadingFeatureMaxMeters: 15,
  nearLeadingFeatureMaxMeters: 75,
  sources: [ratamestarikirja('1.2.5'), ratamestarikirja('11')],
  interpretation: true,
}

export const lineFeatureSiteRuleSchema = citedSchema.extend({
  controlledAlongLengthIsomCodes: z.array(z.string()),
  maxLengthForCentreSiteMeters: z.number().positive(),
})

export const contourFeatureSiteRuleSchema = citedSchema.extend({
  maxClosedContourAreaSquareMeters: z.number().positive(),
  bendMeasuringDistanceMeters: z.number().positive(),
  bendMinTurnDegrees: z.number().positive(),
})

export type LineFeatureSiteRule = z.infer<typeof lineFeatureSiteRuleSchema>
export type ContourFeatureSiteRule = z.infer<typeof contourFeatureSiteRuleSchema>

export const LINE_FEATURE_SITES: LineFeatureSiteRule = {
  controlledAlongLengthIsomCodes: [
    '104',
    '105.1',
    '105.2',
    '106',
    '107',
    '108',
    '201',
    '202',
    '215',
    '523',
  ],
  maxLengthForCentreSiteMeters: 60,
  sources: [isom('sym. 703')],
  interpretation: true,
}

export const CONTOUR_FEATURE_SITES: ContourFeatureSiteRule = {
  maxClosedContourAreaSquareMeters: 10000,
  bendMeasuringDistanceMeters: 15,
  bendMinTurnDegrees: 60,
  sources: [isom('sym. 101'), isom('sym. 103')],
  interpretation: true,
}
