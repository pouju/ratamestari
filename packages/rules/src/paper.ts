import { z } from 'zod'
import { citedSchema, iofDescriptions, ratamestarikirja } from './source'

export const paperSizeSchema = z.enum(['A4', 'A3'])
export type PaperSize = z.infer<typeof paperSizeSchema>

export const paperRuleSchema = citedSchema.extend({
  sizesMillimetres: z.record(paperSizeSchema, z.tuple([z.number(), z.number()])),
  preferenceOrder: z.array(paperSizeSchema),
  printMarginMillimetres: z.number().nonnegative(),
})

export const PAPER: z.infer<typeof paperRuleSchema> = {
  sizesMillimetres: { A4: [210, 297], A3: [297, 420] },
  preferenceOrder: ['A4', 'A3'],
  printMarginMillimetres: 5,
  sources: [ratamestarikirja('6.8.2.S')],
  interpretation: true,
}

export const descriptionBoxRuleSchema = citedSchema.extend({
  boxMillimetres: z.number().min(5).max(7),
  columns: z.int().positive(),
  rowsBesidesControls: z.int().nonnegative(),
})

export const DESCRIPTION_BOX: z.infer<typeof descriptionBoxRuleSchema> = {
  boxMillimetres: 6,
  columns: 8,
  rowsBesidesControls: 4,
  sources: [iofDescriptions('p. 3')],
  interpretation: false,
}
