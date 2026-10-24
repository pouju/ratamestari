import { z } from 'zod'
import { citedSchema, isom, ratamestarikirja } from './source'

export const courseOverprintRuleSchema = citedSchema.extend({
  baseScale: z.number().positive(),
  startTriangleSideMillimetres: z.number().positive(),
  controlCircleDiameterMillimetres: z.number().positive(),
  controlNumberHeightMillimetres: z.number().positive(),
  courseLineWidthMillimetres: z.number().positive(),
  courseLineGapMillimetres: z.number().nonnegative(),
  finishInnerDiameterMillimetres: z.number().positive(),
  finishOuterDiameterMillimetres: z.number().positive(),
  colour: z.string(),
})

export type CourseOverprintRule = z.infer<typeof courseOverprintRuleSchema>

export const COURSE_OVERPRINT: CourseOverprintRule = {
  baseScale: 15000,
  startTriangleSideMillimetres: 6,
  controlCircleDiameterMillimetres: 5,
  controlNumberHeightMillimetres: 4,
  courseLineWidthMillimetres: 0.35,
  courseLineGapMillimetres: 0.5,
  finishInnerDiameterMillimetres: 4,
  finishOuterDiameterMillimetres: 6,
  colour: 'rgb(190, 30, 180)',
  sources: [
    isom('§3.7'),
    isom('sym. 701'),
    isom('sym. 703'),
    isom('sym. 704'),
    isom('sym. 705'),
    isom('sym. 706'),
    ratamestarikirja('6.3'),
  ],
  interpretation: false,
}

export const overprintMillimetresAt = (millimetresAtBaseScale: number, printScale: number) =>
  (millimetresAtBaseScale * COURSE_OVERPRINT.baseScale) / printScale
