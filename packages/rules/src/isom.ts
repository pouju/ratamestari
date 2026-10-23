import { z } from 'zod'
import { runnabilityClassSchema, type RunnabilityClass } from './runnability'
import { citedSchema, isom, lajisaannot, type Source } from './source'

export const runnabilityLayerSchema = z.enum(['cover', 'ground', 'path'])

export const movementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('runnability'),
    runnabilityClass: runnabilityClassSchema,
    layer: runnabilityLayerSchema,
  }),
  z.object({ kind: z.literal('noEffect') }),
  z.object({ kind: z.literal('crossingSlows') }),
  z.object({ kind: z.literal('crossingPoint') }),
  z.object({ kind: z.literal('impassable') }),
  z.object({ kind: z.literal('forbidden') }),
  z.object({ kind: z.literal('forbiddenAlong') }),
  z.object({ kind: z.literal('forbiddenExceptLevelCrossings') }),
  z.object({ kind: z.literal('mandatoryRoute') }),
  z.object({ kind: z.literal('combinedWithOtherSymbols') }),
  z.object({ kind: z.literal('runnabilityFromBackground') }),
  z.object({ kind: z.literal('courseOverprint') }),
  z.object({ kind: z.literal('notTerrain') }),
])

export const controlSiteSchema = z.enum([
  'yes',
  'edge',
  'weak',
  'no',
  'avoid',
  'contourShape',
  'notApplicable',
])

export const isomCodeSchema = z.string().regex(/^[1-7]\d{2}(\.\d)?$/)

export const isomSymbolRuleSchema = citedSchema.extend({
  code: isomCodeSchema,
  name: z.string().min(1),
  movement: movementSchema,
  controlSite: controlSiteSchema,
})

export type RunnabilityLayer = z.infer<typeof runnabilityLayerSchema>
export type Movement = z.infer<typeof movementSchema>
export type ControlSite = z.infer<typeof controlSiteSchema>
export type IsomCode = z.infer<typeof isomCodeSchema>
export type IsomSymbolRule = z.infer<typeof isomSymbolRuleSchema>

const runnable =
  (layer: RunnabilityLayer) =>
  (runnabilityClass: RunnabilityClass): Movement => ({
    kind: 'runnability',
    runnabilityClass,
    layer,
  })
const cover = runnable('cover')
const ground = runnable('ground')
const path = runnable('path')
const NO_EFFECT: Movement = { kind: 'noEffect' }
const CROSSING_SLOWS: Movement = { kind: 'crossingSlows' }
const CROSSING_POINT: Movement = { kind: 'crossingPoint' }
const IMPASSABLE: Movement = { kind: 'impassable' }
const FORBIDDEN: Movement = { kind: 'forbidden' }
const FORBIDDEN_ALONG: Movement = { kind: 'forbiddenAlong' }
const FORBIDDEN_EXCEPT_LEVEL_CROSSINGS: Movement = { kind: 'forbiddenExceptLevelCrossings' }
const MANDATORY_ROUTE: Movement = { kind: 'mandatoryRoute' }
const COMBINED: Movement = { kind: 'combinedWithOtherSymbols' }
const FROM_BACKGROUND: Movement = { kind: 'runnabilityFromBackground' }
const COURSE_OVERPRINT: Movement = { kind: 'courseOverprint' }
const NOT_TERRAIN: Movement = { kind: 'notTerrain' }

const RUNNABILITY_TABLE = isom('§2.3')

interface SymbolOptions {
  interpretation?: boolean
  extraSources?: Source[]
}

const symbol = (
  code: IsomCode,
  name: string,
  movement: Movement,
  controlSite: ControlSite,
  { interpretation = false, extraSources = [] }: SymbolOptions = {},
): IsomSymbolRule => ({
  code,
  name,
  movement,
  controlSite,
  sources: [isom(`sym. ${code}`), ...extraSources],
  interpretation,
})

const ours = { interpretation: true }

export const ISOM_SYMBOL_RULES: readonly IsomSymbolRule[] = [
  symbol('101', 'Contour', NO_EFFECT, 'contourShape'),
  symbol('102', 'Index contour', NO_EFFECT, 'contourShape'),
  symbol('103', 'Form line', NO_EFFECT, 'contourShape'),
  symbol('104', 'Earth bank', CROSSING_SLOWS, 'yes'),
  symbol('105.1', 'Earth wall', CROSSING_SLOWS, 'yes', ours),
  symbol('105.2', 'Retaining earth wall', CROSSING_SLOWS, 'yes', ours),
  symbol('106', 'Ruined earth wall', CROSSING_SLOWS, 'yes', ours),
  symbol('107', 'Erosion gully', CROSSING_SLOWS, 'yes', ours),
  symbol('108', 'Small erosion gully', CROSSING_SLOWS, 'yes', ours),
  symbol('109', 'Small knoll', NO_EFFECT, 'yes'),
  symbol('110', 'Small elongated knoll', NO_EFFECT, 'yes'),
  symbol('111', 'Small depression', NO_EFFECT, 'yes'),
  symbol('112', 'Pit', NO_EFFECT, 'yes'),
  symbol('113', 'Broken ground', NO_EFFECT, 'no'),
  symbol('114', 'Very broken ground', ground(3), 'no', ours),
  symbol('115', 'Prominent landform feature', NO_EFFECT, 'yes'),

  symbol('201', 'Impassable cliff', IMPASSABLE, 'yes'),
  symbol('202', 'Cliff', CROSSING_SLOWS, 'yes'),
  symbol('203.1', 'Rocky pit or cave', NO_EFFECT, 'yes'),
  symbol('203.2', 'Dangerous pit', IMPASSABLE, 'no', ours),
  symbol('204', 'Boulder', NO_EFFECT, 'yes'),
  symbol('205', 'Large boulder', NO_EFFECT, 'yes'),
  symbol('206', 'Gigantic boulder or rock pillar', IMPASSABLE, 'yes', ours),
  symbol('207', 'Boulder cluster', NO_EFFECT, 'yes'),
  symbol('208', 'Boulder field', NO_EFFECT, 'weak'),
  symbol('209', 'Dense boulder field', ground(3), 'weak', ours),
  symbol('210', 'Stony ground, slow running', ground(3), 'no'),
  symbol('211', 'Stony ground, walk', ground(4), 'no'),
  symbol('212', 'Stony ground, fight', ground(5), 'no'),
  symbol('213', 'Sandy ground', ground(3), 'no', ours),
  symbol('214', 'Bare rock', cover(2), 'weak', ours),
  symbol('215', 'Trench', CROSSING_SLOWS, 'yes'),

  symbol('301', 'Uncrossable body of water', IMPASSABLE, 'edge'),
  symbol('302', 'Shallow body of water', ground(3), 'edge', ours),
  symbol('303', 'Waterhole', NO_EFFECT, 'yes'),
  symbol('304', 'Crossable watercourse', CROSSING_SLOWS, 'yes', ours),
  symbol('305', 'Small crossable watercourse', CROSSING_SLOWS, 'yes', ours),
  symbol('306', 'Minor/seasonal water channel', NO_EFFECT, 'yes'),
  symbol('307', 'Uncrossable marsh', IMPASSABLE, 'edge'),
  symbol('308', 'Marsh', ground(3), 'yes', ours),
  symbol('309', 'Narrow marsh', NO_EFFECT, 'yes'),
  symbol('310', 'Indistinct marsh', ground(2), 'weak', ours),
  symbol('311', 'Well, fountain or water tank', NO_EFFECT, 'yes'),
  symbol('312', 'Spring', NO_EFFECT, 'yes'),
  symbol('313', 'Prominent water feature', NO_EFFECT, 'yes'),

  symbol('401', 'Open land', cover(1), 'edge'),
  symbol('402', 'Open land with scattered trees', cover(1), 'edge', ours),
  symbol('403', 'Rough open land', cover(2), 'edge'),
  symbol('404', 'Rough open land with scattered trees', cover(2), 'edge', ours),
  symbol('405', 'Forest', cover(2), 'no', { extraSources: [RUNNABILITY_TABLE] }),
  symbol('406', 'Vegetation: slow running', cover(3), 'edge'),
  symbol('407', 'Vegetation: slow running, good visibility', cover(3), 'edge'),
  symbol('408', 'Vegetation: walk', cover(4), 'edge'),
  symbol('409', 'Vegetation: walk, good visibility', cover(4), 'edge'),
  symbol('410', 'Vegetation: fight', cover(5), 'edge'),
  symbol('412', 'Cultivated land', cover(2), 'avoid', ours),
  symbol('413', 'Orchard', COMBINED, 'edge'),
  symbol('414', 'Vineyard or similar', COMBINED, 'edge'),
  symbol('415', 'Distinct cultivation boundary', NO_EFFECT, 'weak'),
  symbol('416', 'Distinct vegetation boundary', NO_EFFECT, 'weak'),
  symbol('417', 'Prominent large tree', NO_EFFECT, 'yes'),
  symbol('418', 'Prominent bush or tree', NO_EFFECT, 'yes'),
  symbol('419', 'Prominent vegetation feature', NO_EFFECT, 'yes'),

  symbol('501', 'Paved area', cover(1), 'edge', { extraSources: [RUNNABILITY_TABLE] }),
  symbol('502', 'Wide road', path(1), 'yes', { ...ours, extraSources: [RUNNABILITY_TABLE] }),
  symbol('503', 'Road', path(1), 'yes', { ...ours, extraSources: [RUNNABILITY_TABLE] }),
  symbol('504', 'Vehicle track', path(1), 'yes', {
    ...ours,
    extraSources: [RUNNABILITY_TABLE],
  }),
  symbol('505', 'Footpath', path(1), 'yes', { extraSources: [RUNNABILITY_TABLE] }),
  symbol('506', 'Small footpath', path(1), 'yes', ours),
  symbol('507', 'Less distinct small footpath', path(2), 'yes', ours),
  symbol('508', 'Narrow ride or linear trace through the terrain', FROM_BACKGROUND, 'yes'),
  symbol('509', 'Railway', FORBIDDEN_EXCEPT_LEVEL_CROSSINGS, 'no', {
    extraSources: [lajisaannot('3.61 f')],
  }),
  symbol('510', 'Power line, cableway or skilift', NO_EFFECT, 'yes'),
  symbol('511', 'Major power line', NO_EFFECT, 'yes'),
  symbol('512', 'Bridge / tunnel', CROSSING_POINT, 'yes'),
  symbol('513.1', 'Wall', CROSSING_SLOWS, 'yes'),
  symbol('513.2', 'Retaining wall', CROSSING_SLOWS, 'yes'),
  symbol('514', 'Ruined wall', CROSSING_SLOWS, 'yes', ours),
  symbol('515', 'Impassable wall', IMPASSABLE, 'yes'),
  symbol('516', 'Fence', CROSSING_SLOWS, 'yes'),
  symbol('517', 'Ruined fence', CROSSING_SLOWS, 'yes', ours),
  symbol('518', 'Impassable fence', IMPASSABLE, 'yes'),
  symbol('519', 'Crossing point', CROSSING_POINT, 'yes'),
  symbol('520', 'Area that shall not be entered', FORBIDDEN, 'no'),
  symbol('521', 'Building', IMPASSABLE, 'edge'),
  symbol('522', 'Canopy', cover(1), 'yes', ours),
  symbol('523', 'Ruin', NO_EFFECT, 'yes'),
  symbol('524', 'High tower', NO_EFFECT, 'yes'),
  symbol('525', 'Small tower', NO_EFFECT, 'yes'),
  symbol('526', 'Cairn', NO_EFFECT, 'yes'),
  symbol('527', 'Fodder rack', NO_EFFECT, 'yes'),
  symbol('528', 'Prominent line feature', CROSSING_SLOWS, 'yes'),
  symbol('529', 'Prominent uncrossable line feature', IMPASSABLE, 'yes'),
  symbol('530', 'Prominent man-made feature - ring', NO_EFFECT, 'yes'),
  symbol('531', 'Prominent man-made feature - x', NO_EFFECT, 'yes'),
  symbol('532', 'Stairway', path(2), 'yes', ours),

  symbol('601', 'Magnetic north line', NOT_TERRAIN, 'notApplicable'),
  symbol('602', 'Registration mark', NOT_TERRAIN, 'notApplicable'),
  symbol('603', 'Spot height', NOT_TERRAIN, 'notApplicable'),

  symbol('701', 'Start', COURSE_OVERPRINT, 'notApplicable'),
  symbol('702', 'Map issue point', COURSE_OVERPRINT, 'notApplicable'),
  symbol('703', 'Control point', COURSE_OVERPRINT, 'notApplicable'),
  symbol('704', 'Control number', COURSE_OVERPRINT, 'notApplicable'),
  symbol('705', 'Course line', COURSE_OVERPRINT, 'notApplicable'),
  symbol('706', 'Finish', COURSE_OVERPRINT, 'notApplicable'),
  symbol('707', 'Marked route', MANDATORY_ROUTE, 'notApplicable'),
  symbol('708', 'Out-of-bounds boundary', FORBIDDEN, 'notApplicable'),
  symbol('709', 'Out-of-bounds area', FORBIDDEN, 'notApplicable'),
  symbol('710', 'Crossing point', CROSSING_POINT, 'notApplicable'),
  symbol('711', 'Out-of-bounds route', FORBIDDEN_ALONG, 'notApplicable'),
  symbol('712', 'First aid post', COURSE_OVERPRINT, 'notApplicable'),
  symbol('713', 'Refreshment point', COURSE_OVERPRINT, 'notApplicable'),
  symbol('715', 'Continuing point after map exchange', COURSE_OVERPRINT, 'notApplicable'),
]

const rulesByCode = new Map(ISOM_SYMBOL_RULES.map(rule => [rule.code, rule]))

export const isomSymbolRule = (code: IsomCode): IsomSymbolRule | undefined => rulesByCode.get(code)
