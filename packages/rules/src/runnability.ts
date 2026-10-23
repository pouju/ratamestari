import { z } from 'zod'
import { citedSchema, isom } from './source'

export const runnabilityClassSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])

export const runnabilityRuleSchema = citedSchema.extend({
  minSpeedFraction: z.number().min(0),
  maxSpeedFraction: z.number().positive().nullable(),
  speedFactor: z.number().positive(),
})

export type RunnabilityClass = z.infer<typeof runnabilityClassSchema>
export type RunnabilityRule = z.infer<typeof runnabilityRuleSchema>

const runnabilityTable = isom('§2.3')

export const RUNNABILITY: Readonly<Record<RunnabilityClass, RunnabilityRule>> = {
  1: {
    minSpeedFraction: 1,
    maxSpeedFraction: null,
    speedFactor: 1.1,
    sources: [runnabilityTable],
    interpretation: true,
  },
  2: {
    minSpeedFraction: 0.8,
    maxSpeedFraction: 1,
    speedFactor: 0.9,
    sources: [runnabilityTable],
    interpretation: true,
  },
  3: {
    minSpeedFraction: 0.6,
    maxSpeedFraction: 0.8,
    speedFactor: 0.7,
    sources: [runnabilityTable],
    interpretation: true,
  },
  4: {
    minSpeedFraction: 0.2,
    maxSpeedFraction: 0.6,
    speedFactor: 0.4,
    sources: [runnabilityTable],
    interpretation: true,
  },
  5: {
    minSpeedFraction: 0,
    maxSpeedFraction: 0.2,
    speedFactor: 0.1,
    sources: [runnabilityTable],
    interpretation: true,
  },
}
