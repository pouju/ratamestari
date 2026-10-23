import { z } from 'zod'
import { citedSchema, iofRules, lajisaannot } from './source'

export const eventLevelSchema = z.enum(['national', 'finnishChampionship'])
export const formatSchema = z.enum(['middle', 'long'])
export const sexSchema = z.enum(['H', 'D'])
export const ageClassSchema = z.literal([
  10, 12, 13, 14, 15, 16, 18, 20, 21, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
])

export type EventLevel = z.infer<typeof eventLevelSchema>
export type Format = z.infer<typeof formatSchema>
export type Sex = z.infer<typeof sexSchema>
export type AgeClass = z.infer<typeof ageClassSchema>

export const winningTimeSchema = citedSchema.extend({
  minMinutes: z.number().positive(),
  maxMinutes: z.number().positive(),
  targetMinutes: z.number().positive(),
})

export type WinningTime = z.infer<typeof winningTimeSchema>

type MinutesRange = readonly [min: number, max: number]
type WinningTimeTable = Partial<Record<AgeClass, Readonly<Record<Format, MinutesRange>>>>

const NATIONAL: WinningTimeTable = {
  10: { middle: [14, 16], long: [16, 20] },
  12: { middle: [15, 20], long: [20, 25] },
  13: { middle: [15, 20], long: [25, 30] },
  14: { middle: [15, 20], long: [30, 35] },
  15: { middle: [20, 25], long: [35, 40] },
  16: { middle: [20, 25], long: [40, 45] },
  18: { middle: [25, 30], long: [50, 55] },
  20: { middle: [25, 30], long: [55, 60] },
  21: { middle: [30, 35], long: [65, 75] },
  35: { middle: [30, 35], long: [60, 65] },
  40: { middle: [30, 35], long: [55, 60] },
  45: { middle: [30, 35], long: [50, 55] },
  50: { middle: [25, 30], long: [50, 55] },
  55: { middle: [25, 30], long: [45, 50] },
  60: { middle: [25, 30], long: [45, 50] },
  65: { middle: [25, 30], long: [45, 50] },
  70: { middle: [25, 30], long: [40, 45] },
  75: { middle: [25, 30], long: [40, 45] },
  80: { middle: [25, 30], long: [40, 45] },
  85: { middle: [25, 30], long: [40, 45] },
  90: { middle: [25, 30], long: [40, 45] },
}

const FINNISH_CHAMPIONSHIP_FINAL: WinningTimeTable = {
  15: { middle: [20, 25], long: [40, 50] },
  16: { middle: [20, 25], long: [45, 55] },
  18: { middle: [25, 30], long: [55, 65] },
  20: { middle: [25, 30], long: [65, 75] },
  21: { middle: [30, 35], long: [85, 95] },
  35: { middle: [30, 35], long: [65, 75] },
  40: { middle: [30, 35], long: [60, 70] },
  45: { middle: [30, 35], long: [55, 65] },
  50: { middle: [25, 30], long: [50, 60] },
  55: { middle: [25, 30], long: [50, 60] },
  60: { middle: [25, 30], long: [45, 55] },
  65: { middle: [25, 30], long: [45, 55] },
  70: { middle: [25, 30], long: [40, 50] },
  75: { middle: [25, 30], long: [40, 50] },
  80: { middle: [25, 30], long: [40, 50] },
  85: { middle: [25, 30], long: [40, 50] },
  90: { middle: [25, 30], long: [40, 50] },
}

const TABLES: Readonly<
  Record<EventLevel, { table: WinningTimeTable; section: Record<Format, string> }>
> = {
  national: { table: NATIONAL, section: { middle: '11.25', long: '11.25' } },
  finnishChampionship: {
    table: FINNISH_CHAMPIONSHIP_FINAL,
    section: { middle: '19.44', long: '19.41' },
  },
}

export function winningTimeFor(
  eventLevel: EventLevel,
  format: Format,
  ageClass: AgeClass,
): WinningTime | null {
  const { table, section } = TABLES[eventLevel]
  const range = table[ageClass]?.[format]
  if (!range) return null
  const [minMinutes, maxMinutes] = range
  return {
    minMinutes,
    maxMinutes,
    targetMinutes: (minMinutes + maxMinutes) / 2,
    sources: [lajisaannot(section[format]), iofRules('16.9')],
    interpretation: true,
  }
}
