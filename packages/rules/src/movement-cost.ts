import { z } from 'zod'
import { runnabilityClassSchema } from './runnability'
import { citedSchema, isom } from './source'

export const citedNumberSchema = citedSchema.extend({ value: z.number().positive() })

export const unmappedTerrainRuleSchema = citedSchema.extend({
  runnabilityClass: runnabilityClassSchema,
})

export type CitedNumber = z.infer<typeof citedNumberSchema>
export type UnmappedTerrainRule = z.infer<typeof unmappedTerrainRuleSchema>

export const REFERENCE_PACE_SECONDS_PER_KM: CitedNumber = {
  value: 240,
  sources: [isom('§2.3')],
  interpretation: true,
}

export const UNMAPPED_TERRAIN: UnmappedTerrainRule = {
  runnabilityClass: 2,
  sources: [isom('§3.4'), isom('sym. 405')],
  interpretation: false,
}

export const CROSSING_SLOWS_SPEED_FACTOR: CitedNumber = {
  value: 0.5,
  sources: [isom('sym. 104'), isom('sym. 202'), isom('sym. 304'), isom('sym. 516')],
  interpretation: true,
}

export const FORBIDDEN_ALONG_SPEED_FACTOR: CitedNumber = {
  value: 0.1,
  sources: [isom('sym. 711')],
  interpretation: true,
}
