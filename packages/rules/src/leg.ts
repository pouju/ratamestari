import { z } from 'zod'
import { citedNumberSchema } from './movement-cost'
import { citedSchema, iofRules, isom, ratamestarikirja } from './source'

export const routeChoiceRuleSchema = citedSchema.extend({
  maxExtraTimeShare: z.number().positive(),
  minSeparationMeters: z.number().positive(),
  minSeparationShareOfStraightDistance: z.number().positive(),
  maxAlternatives: z.int().positive(),
})

export type RouteChoiceRule = z.infer<typeof routeChoiceRuleSchema>

export const ROUTE_CHOICE: RouteChoiceRule = {
  maxExtraTimeShare: 0.1,
  minSeparationMeters: 50,
  minSeparationShareOfStraightDistance: 0.15,
  maxAlternatives: 2,
  sources: [ratamestarikirja('1.2.2.SHP'), iofRules('App. 2 §3.8')],
  interpretation: true,
}

export const DEFAULT_CONTOUR_INTERVAL_METERS = citedNumberSchema.parse({
  value: 5,
  sources: [isom('sym. 101')],
  interpretation: false,
})
