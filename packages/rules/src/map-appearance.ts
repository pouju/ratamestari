import { z } from 'zod'
import { isomCodeSchema } from './isom'
import { citedSchema, isom, type Source } from './source'

// How ISOM symbols look on a printed map, for reading a map from a PDF or an image
// (docs/rules/isom-drawing.md). All sizes are millimetres at 1:15 000 (ISOM 2017-2 §2.9).

export const inkSchema = z.enum([
  'black',
  'black 35%',
  'brown',
  'brown 50%',
  'blue',
  'blue 70%',
  'blue 50%',
  'green',
  'green 60%',
  'green 30%',
  'yellow',
  'yellow 50%',
  'olive',
  'white',
  'purple',
])

const dashSchema = z.object({ dashMm: z.number().positive(), gapMm: z.number().positive() })

export const appearanceSchema = z.discriminatedUnion('draw', [
  z.object({ draw: z.literal('area'), ink: inkSchema }),
  z.object({
    draw: z.literal('pattern'),
    ink: inkSchema,
    element: z.enum(['dots', 'lines', 'dashes']),
    spacingMm: z.number().positive(),
    dotMm: z.number().positive().optional(),
    // The flat colour the pattern is printed on, when it is part of the symbol.
    on: inkSchema.optional(),
  }),
  z.object({
    draw: z.literal('line'),
    ink: inkSchema,
    widthMm: z.number().positive(),
    dash: dashSchema.nullable(),
    // Short tags along one side, centre to centre.
    tagEveryMm: z.number().positive().optional(),
    // The width is a minimum: the symbol is drawn to scale when wider.
    widthIsMinimum: z.boolean().optional(),
    // Thin lines along both sides that belong to this symbol.
    edgeWidthMm: z.number().positive().optional(),
  }),
  z.object({
    draw: z.literal('dottedLine'),
    ink: inkSchema,
    dotMm: z.number().positive(),
    spacingMm: z.number().positive(),
  }),
  z.object({
    draw: z.literal('scatteredDots'),
    ink: inkSchema,
    dotMm: z.number().positive(),
    spacingMm: z.object({ min: z.number().positive(), max: z.number().positive() }),
  }),
  z.object({
    draw: z.literal('point'),
    ink: inkSchema,
    shape: z.enum([
      'dot',
      'ellipse',
      'triangle',
      'unevenTriangle',
      'v',
      'halfCircle',
      'square',
      'ring',
    ]),
    sizeMm: z.number().positive(),
    // Line width of a symbol drawn as an outline.
    lineWidthMm: z.number().positive().optional(),
  }),
])

export const mapAppearanceSchema = citedSchema.extend({
  code: isomCodeSchema,
  appearance: appearanceSchema,
})

export type Ink = z.infer<typeof inkSchema>
export type Appearance = z.infer<typeof appearanceSchema>
export type MapAppearance = z.infer<typeof mapAppearanceSchema>

const sym = (code: string): Source => isom(`sym. ${code}`)
const looks = (
  code: string,
  appearance: Appearance,
  { interpretation = false, extraSources = [] as Source[] } = {},
): MapAppearance => ({
  code,
  appearance,
  sources: [sym(code), ...extraSources],
  interpretation,
})
const dotPattern = (ink: Ink, spacingMm: number, dotMm: number, on: Ink) => ({
  draw: 'pattern' as const,
  ink,
  element: 'dots' as const,
  spacingMm,
  dotMm,
  on,
})
const solid = (ink: Ink, widthMm: number) => ({ draw: 'line' as const, ink, widthMm, dash: null })
const dashed = (ink: Ink, widthMm: number, dashMm: number, gapMm: number) => ({
  draw: 'line' as const,
  ink,
  widthMm,
  dash: { dashMm, gapMm },
})
const tagged = (ink: Ink, widthMm: number, tagEveryMm: number) => ({
  ...solid(ink, widthMm),
  tagEveryMm,
})
const area = (ink: Ink) => ({ draw: 'area' as const, ink })
type Shape = Extract<Appearance, { draw: 'point' }>['shape']
const point = (ink: Ink, shape: Shape, sizeMm: number) => ({
  draw: 'point' as const,
  ink,
  shape,
  sizeMm,
})
const outline = (ink: Ink, shape: Shape, sizeMm: number, lineWidthMm: number) => ({
  ...point(ink, shape, sizeMm),
  lineWidthMm,
})

export const MAP_APPEARANCES: readonly MapAppearance[] = [
  looks('101', solid('brown', 0.14)),
  looks('102', solid('brown', 0.25)),
  looks('103', dashed('brown', 0.1, 2.0, 0.2)),
  looks('104', tagged('brown', 0.25, 0.5)),
  looks('107', solid('brown', 0.25)),
  looks('108', { draw: 'dottedLine', ink: 'brown', dotMm: 0.25, spacingMm: 0.45 }),
  looks('109', point('brown', 'dot', 0.5)),
  looks('110', point('brown', 'ellipse', 0.8)),
  looks('111', outline('brown', 'halfCircle', 0.8, 0.18)),
  looks('112', outline('brown', 'v', 0.8, 0.18)),
  looks('113', {
    draw: 'scatteredDots',
    ink: 'brown',
    dotMm: 0.2,
    spacingMm: { min: 0.5, max: 0.6 },
  }),
  looks('114', {
    draw: 'scatteredDots',
    ink: 'brown',
    dotMm: 0.2,
    spacingMm: { min: 0.25, max: 0.38 },
  }),

  looks('201', tagged('black', 0.35, 0.5)),
  looks('202', solid('black', 0.25)),
  looks('203.1', outline('black', 'v', 0.8, 0.16)),
  looks('204', point('black', 'dot', 0.4)),
  looks('205', point('black', 'dot', 0.6)),
  looks('207', point('black', 'triangle', 0.8)),
  looks('208', point('black', 'unevenTriangle', 0.8)),
  looks('210', {
    draw: 'scatteredDots',
    ink: 'black',
    dotMm: 0.2,
    spacingMm: { min: 0.45, max: 0.6 },
  }),
  looks('211', {
    draw: 'scatteredDots',
    ink: 'black',
    dotMm: 0.2,
    spacingMm: { min: 0.32, max: 0.4 },
  }),
  looks('212', {
    draw: 'scatteredDots',
    ink: 'black',
    dotMm: 0.2,
    spacingMm: { min: 0.25, max: 0.32 },
  }),
  looks('213', dotPattern('black', 0.45, 0.16, 'yellow 50%')),
  looks('214', area('black 35%')),

  looks('301', area('blue')),
  looks('301', area('blue 70%')),
  looks('302', area('blue 50%')),
  looks('303', outline('blue', 'v', 0.8, 0.18)),
  looks('304', solid('blue', 0.3)),
  looks('305', solid('blue', 0.18)),
  looks('306', dashed('blue', 0.18, 1.25, 0.25)),
  looks('307', { draw: 'pattern', ink: 'blue', element: 'lines', spacingMm: 0.5 }),
  looks('308', { draw: 'pattern', ink: 'blue', element: 'lines', spacingMm: 0.3 }),
  looks('309', { draw: 'dottedLine', ink: 'blue', dotMm: 0.25, spacingMm: 0.45 }),
  looks('310', { draw: 'pattern', ink: 'blue', element: 'dashes', spacingMm: 0.3 }),
  looks('311', outline('blue', 'square', 0.8, 0.18)),
  looks('312', outline('blue', 'halfCircle', 0.9, 0.18)),

  looks('401', area('yellow')),
  looks('402', dotPattern('white', 0.7, 0.4, 'yellow')),
  looks('403', area('yellow 50%')),
  looks('404', dotPattern('white', 0.8, 0.5, 'yellow 50%')),
  looks('406', area('green 30%')),
  looks('407', { draw: 'pattern', ink: 'green', element: 'lines', spacingMm: 0.84 }),
  looks('408', area('green 60%')),
  looks('409', { draw: 'pattern', ink: 'green', element: 'lines', spacingMm: 0.42 }),
  looks('410', area('green')),
  looks('412', dotPattern('black', 0.8, 0.2, 'yellow')),
  looks('413', dotPattern('green', 0.8, 0.45, 'yellow')),
  looks('415', solid('black', 0.1)),
  // Maps drawn before ISOM 2017-2 Errata 20.01.2020 use the old width 0.14.
  looks('415', solid('black', 0.14), { extraSources: [isom('Errata 20.01.2020')] }),
  looks('416', { draw: 'dottedLine', ink: 'black', dotMm: 0.22, spacingMm: 0.45 }),
  looks('418', point('green', 'dot', 0.6)),

  looks('501', area('brown 50%')),
  looks('502', { ...solid('brown 50%', 0.3), widthIsMinimum: true, edgeWidthMm: 0.14 }),
  looks('503', solid('black', 0.35)),
  looks('504', dashed('black', 0.35, 3.0, 0.25)),
  looks('505', dashed('black', 0.25, 2.0, 0.25)),
  looks('506', dashed('black', 0.18, 1.0, 0.25)),
  looks('508', dashed('black', 0.14, 2.0, 0.25)),
  looks('510', solid('black', 0.14)),
  looks('516', tagged('black', 0.14, 2.0)),
  // Interpretation: the olive of 520 is yellow overprinted with green 50% (sym. 520 figure).
  looks('520', area('olive'), { interpretation: true }),
  looks('521', area('black')),
  looks('530', outline('black', 'ring', 0.8, 0.16)),

  looks('601', solid('black', 0.1)),
  looks('601', solid('blue', 0.12), { extraSources: [isom('Errata 23.01.2022')] }),

  looks('709', { draw: 'pattern', ink: 'purple', element: 'lines', spacingMm: 1.2 }),
]
