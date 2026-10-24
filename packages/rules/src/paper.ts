import { z } from 'zod'
import { citedSchema, iofDescriptions, isom, lajisaannot, ratamestarikirja } from './source'
import { formatSchema, type Format } from './winning-time'

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

export const peripheralInformationRuleSchema = citedSchema.extend({
  groupingGapMillimetres: z.number().positive(),
  captionGapMillimetres: z.number().nonnegative(),
  paddingMillimetres: z.number().nonnegative(),
  textSlackShare: z.number().nonnegative(),
  gapMillimetres: z.number().nonnegative(),
  scaleLineMillimetres: z.number().positive(),
  scaleLineWidthMillimetres: z.number().positive(),
  copyrightPattern: z.instanceof(RegExp),
  contourIntervalPattern: z.instanceof(RegExp),
})

// ISOM requires the scale and contour interval on the front of the map. The map's own scale text
// may be wrong for the print scale, so the print states both itself, and carries over the club's
// logo and copyright notice from the map's margin.
export const PERIPHERAL_INFORMATION: z.infer<typeof peripheralInformationRuleSchema> = {
  groupingGapMillimetres: 3,
  captionGapMillimetres: 1,
  paddingMillimetres: 0.5,
  textSlackShare: 0.15,
  gapMillimetres: 2,
  scaleLineMillimetres: 4,
  scaleLineWidthMillimetres: 45,
  copyrightPattern: /©|\(c\)|copyright|kopiointi|kopioiminen|tekijänoikeu|upphovsr|all rights/i,
  contourIntervalPattern:
    /(?:käyräväli|contour interval|ekvidistans|equidistance)\D{0,10}(\d+(?:[.,]\d+)?)\s*m\b/i,
  sources: [isom('2.13')],
  interpretation: true,
}

export const printScaleSchema = z.literal([15000, 10000, 7500, 5000, 4000])
export type PrintScale = z.infer<typeof printScaleSchema>

export const printScaleRuleSchema = citedSchema.extend({
  defaultByFormat: z.record(formatSchema, printScaleSchema),
})

export const PRINT_SCALE: z.infer<typeof printScaleRuleSchema> = {
  defaultByFormat: { long: 15000, middle: 10000 },
  sources: [ratamestarikirja('6.8.1'), lajisaannot('12.13')],
  interpretation: false,
}

export type PrintScaleChoice = PrintScale | 'auto'

export const printScaleFor = (choice: PrintScaleChoice, format: Format): PrintScale =>
  choice === 'auto' ? PRINT_SCALE.defaultByFormat[format] : choice
