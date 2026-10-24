import { z } from 'zod'
import { citedSchema, iofDescriptions, iofRules, ratamestarikirja } from './source'

export const descriptionSymbolSchema = citedSchema.extend({
  ref: z.string().regex(/^\d{1,2}\.\d{1,2}$/),
  name: z.string().min(1),
})

export type DescriptionSymbol = z.infer<typeof descriptionSymbolSchema>

const symbol = (ref: string, name: string): DescriptionSymbol => ({
  ref,
  name,
  sources: [iofDescriptions(ref)],
  interpretation: false,
})

export const DESCRIPTION_FEATURES = {
  terrace: symbol('1.1', 'Terrace'),
  spur: symbol('1.2', 'Spur'),
  reEntrant: symbol('1.3', 'Re-entrant'),
  earthBank: symbol('1.4', 'Earth bank'),
  quarry: symbol('1.5', 'Quarry'),
  earthWall: symbol('1.6', 'Earth wall'),
  erosionGully: symbol('1.7', 'Erosion gully'),
  smallErosionGully: symbol('1.8', 'Small erosion gully'),
  hill: symbol('1.9', 'Hill'),
  knoll: symbol('1.10', 'Knoll'),
  saddle: symbol('1.11', 'Saddle'),
  depression: symbol('1.12', 'Depression'),
  smallDepression: symbol('1.13', 'Small depression'),
  pit: symbol('1.14', 'Pit'),
  brokenGround: symbol('1.15', 'Broken ground'),
  antHill: symbol('1.16', 'Ant hill'),
  cliff: symbol('2.1', 'Cliff'),
  rockPillar: symbol('2.2', 'Rock pillar'),
  cave: symbol('2.3', 'Cave'),
  boulder: symbol('2.4', 'Boulder'),
  boulderField: symbol('2.5', 'Boulder field'),
  boulderCluster: symbol('2.6', 'Boulder cluster'),
  stonyGround: symbol('2.7', 'Stony ground'),
  bareRock: symbol('2.8', 'Bare rock'),
  narrowPassage: symbol('2.9', 'Narrow passage'),
  trench: symbol('2.10', 'Trench'),
  lake: symbol('3.1', 'Lake'),
  pond: symbol('3.2', 'Pond'),
  waterhole: symbol('3.3', 'Waterhole'),
  stream: symbol('3.4', 'Stream'),
  ditch: symbol('3.5', 'Ditch'),
  narrowMarsh: symbol('3.6', 'Narrow marsh'),
  marsh: symbol('3.7', 'Marsh'),
  firmGroundInMarsh: symbol('3.8', 'Firm ground in marsh'),
  well: symbol('3.9', 'Well'),
  spring: symbol('3.10', 'Spring'),
  waterTank: symbol('3.11', 'Water tank'),
  openLand: symbol('4.1', 'Open land'),
  semiOpenLand: symbol('4.2', 'Semi-open land'),
  forestCorner: symbol('4.3', 'Forest corner'),
  clearing: symbol('4.4', 'Clearing'),
  thicket: symbol('4.5', 'Thicket'),
  linearThicket: symbol('4.6', 'Linear thicket'),
  vegetationBoundary: symbol('4.7', 'Vegetation boundary'),
  copse: symbol('4.8', 'Copse'),
  prominentTree: symbol('4.9', 'Prominent tree'),
  prominentVegetationFeature: symbol('4.10', 'Prominent vegetation feature'),
  road: symbol('5.1', 'Road'),
  path: symbol('5.2', 'Path'),
  ride: symbol('5.3', 'Ride'),
  bridge: symbol('5.4', 'Bridge'),
  powerLine: symbol('5.5', 'Power line'),
  pylon: symbol('5.6', 'Pylon'),
  tunnel: symbol('5.7', 'Tunnel'),
  wall: symbol('5.8', 'Wall'),
  fence: symbol('5.9', 'Fence'),
  crossingPoint: symbol('5.10', 'Crossing point'),
  building: symbol('5.11', 'Building'),
  pavedArea: symbol('5.12', 'Paved area'),
  ruin: symbol('5.13', 'Ruin'),
  pipeline: symbol('5.14', 'Pipeline'),
  tower: symbol('5.15', 'Tower'),
  shootingPlatform: symbol('5.16', 'Shooting platform'),
  cairn: symbol('5.17', 'Cairn'),
  fodderRack: symbol('5.18', 'Fodder rack'),
  charcoalBurningGround: symbol('5.19', 'Charcoal burning ground'),
  monument: symbol('5.20', 'Monument'),
  canopy: symbol('5.21', 'Canopy'),
  stairway: symbol('5.22', 'Stairway'),
  outOfBoundsArea: symbol('5.23', 'Out of bounds area'),
  railway: symbol('5.24', 'Railway'),
  specialItemCross: symbol('6.1', 'Special item'),
  specialItemCircle: symbol('6.2', 'Special item'),
} as const

export const DESCRIPTION_APPEARANCES = {
  low: symbol('8.1', 'low'),
  shallow: symbol('8.2', 'shallow'),
  deep: symbol('8.3', 'deep'),
  overgrown: symbol('8.4', 'overgrown'),
  open: symbol('8.5', 'open'),
  rocky: symbol('8.6', 'rocky'),
  marshy: symbol('8.7', 'marshy'),
  sandy: symbol('8.8', 'sandy'),
  needleLeaved: symbol('8.9', 'needle leaved'),
  broadLeaved: symbol('8.10', 'broad leaved'),
  ruined: symbol('8.11', 'ruined'),
} as const

export const DESCRIPTION_LOCATIONS = {
  side: symbol('12.1', 'side'),
  edge: symbol('12.2', 'edge'),
  part: symbol('12.3', 'part'),
  cornerInside: symbol('12.4', 'corner (inside)'),
  cornerOutside: symbol('12.5', 'corner (outside)'),
  tip: symbol('12.6', 'tip'),
  end: symbol('12.7', 'end'),
  upperPart: symbol('12.8', 'upper part'),
  lowerPart: symbol('12.9', 'lower part'),
  top: symbol('12.10', 'top'),
  foot: symbol('12.11', 'foot'),
  directionalFoot: symbol('12.12', 'foot'),
  beneath: symbol('12.13', 'beneath'),
  between: symbol('12.14', 'between'),
} as const

export const DESCRIPTION_FINISH_ROUTES = {
  tapedAllTheWay: symbol('16.1', 'Follow taped route'),
  tapedFromFunnel: symbol('16.2', 'Navigate to finish funnel, then follow tapes'),
  notTaped: symbol('16.3', 'Navigate to finish'),
} as const

export type DescriptionFeature = keyof typeof DESCRIPTION_FEATURES
export type DescriptionAppearance = keyof typeof DESCRIPTION_APPEARANCES
export type DescriptionLocation = keyof typeof DESCRIPTION_LOCATIONS
export type DescriptionFinishRoute = keyof typeof DESCRIPTION_FINISH_ROUTES

export const isomDescriptionSchema = citedSchema.extend({
  feature: z.enum(Object.keys(DESCRIPTION_FEATURES) as [DescriptionFeature]),
  appearance: z.enum(Object.keys(DESCRIPTION_APPEARANCES) as [DescriptionAppearance]).nullable(),
  flagOnAreaSide: z.boolean(),
})

export type IsomDescription = z.infer<typeof isomDescriptionSchema>

interface MappingOptions {
  appearance?: DescriptionAppearance
  flagOnAreaSide?: boolean
  interpretation?: boolean
}

const as = (
  feature: DescriptionFeature,
  { appearance, flagOnAreaSide = true, interpretation = false }: MappingOptions = {},
): IsomDescription => ({
  feature,
  appearance: appearance ?? null,
  flagOnAreaSide,
  sources: [
    iofDescriptions(DESCRIPTION_FEATURES[feature].ref),
    ...(appearance ? [iofDescriptions(DESCRIPTION_APPEARANCES[appearance].ref)] : []),
  ],
  interpretation,
})

const ours = { interpretation: true }
const flagOutside = { flagOnAreaSide: false, interpretation: true }

export const ISOM_DESCRIPTIONS: Readonly<Record<string, IsomDescription>> = {
  '101': as('knoll', ours),
  '102': as('knoll', ours),
  '103': as('knoll', ours),
  '104': as('earthBank'),
  '105.1': as('earthWall'),
  '105.2': as('earthWall'),
  '106': as('earthWall', { appearance: 'ruined', ...ours }),
  '107': as('erosionGully'),
  '108': as('smallErosionGully'),
  '109': as('knoll'),
  '110': as('knoll'),
  '111': as('smallDepression'),
  '112': as('pit'),
  '115': as('specialItemCross'),
  '201': as('cliff'),
  '202': as('cliff'),
  '203': as('pit', { appearance: 'rocky' }),
  '203.1': as('pit', { appearance: 'rocky' }),
  '204': as('boulder'),
  '205': as('boulder'),
  '206': as('rockPillar'),
  '207': as('boulderCluster'),
  '208': as('boulderField'),
  '209': as('boulderField'),
  '210': as('stonyGround'),
  '211': as('stonyGround'),
  '212': as('stonyGround'),
  '213': as('openLand', { appearance: 'sandy' }),
  '214': as('bareRock'),
  '215': as('trench'),
  '301': as('lake', flagOutside),
  '302': as('pond', flagOutside),
  '303': as('waterhole'),
  '304': as('stream'),
  '305': as('stream'),
  '306': as('ditch'),
  '307': as('marsh', flagOutside),
  '308': as('marsh'),
  '309': as('narrowMarsh'),
  '310': as('marsh'),
  '311': as('well'),
  '312': as('spring'),
  '313': as('specialItemCross'),
  '401': as('openLand'),
  '402': as('semiOpenLand'),
  '403': as('openLand'),
  '404': as('semiOpenLand'),
  '406': as('thicket', flagOutside),
  '407': as('thicket', flagOutside),
  '408': as('thicket', flagOutside),
  '409': as('thicket', flagOutside),
  '410': as('thicket', flagOutside),
  '411': as('linearThicket'),
  '412': as('openLand'),
  '413': as('openLand'),
  '414': as('openLand'),
  '415': as('vegetationBoundary'),
  '416': as('vegetationBoundary'),
  '417': as('prominentTree'),
  '418': as('prominentTree'),
  '419': as('prominentVegetationFeature'),
  '501': as('pavedArea'),
  '502': as('road'),
  '503': as('road'),
  '504': as('path'),
  '505': as('path'),
  '506': as('path'),
  '507': as('path'),
  '508': as('ride'),
  '509': as('railway'),
  '510': as('powerLine'),
  '511': as('powerLine'),
  '512': as('bridge'),
  '513': as('wall'),
  '513.1': as('wall'),
  '513.2': as('wall'),
  '514': as('wall', { appearance: 'ruined' }),
  '515': as('wall'),
  '516': as('fence'),
  '517': as('fence', { appearance: 'ruined' }),
  '518': as('fence'),
  '519': as('crossingPoint'),
  '520': as('outOfBoundsArea', flagOutside),
  '521': as('building', flagOutside),
  '522': as('canopy'),
  '523': as('ruin'),
  '524': as('tower'),
  '525': as('tower'),
  '526': as('cairn'),
  '527': as('fodderRack'),
  '528': as('pipeline'),
  '529': as('pipeline'),
  '530': as('specialItemCircle'),
  '531': as('specialItemCross'),
  '532': as('stairway'),
}

export function isomDescription(isomCode: string): IsomDescription | undefined {
  return ISOM_DESCRIPTIONS[isomCode] ?? ISOM_DESCRIPTIONS[isomCode.split('.')[0]!]
}

export const DESCRIPTION_GEOMETRY = {
  cornerMaxTurnDegrees: 135,
  similarFeatureClearMarginMeters: 5,
  similarFeatureNeedsClarifierWithinMeters: 25,
  sources: [
    iofDescriptions('12.4'),
    iofDescriptions('12.6'),
    iofDescriptions('col. C'),
    ratamestarikirja('5.2.ST'),
  ],
  interpretation: true,
}

export const flagSideLocationSchema = z.enum(['side', 'edge', 'directionalFoot'])
export type FlagSideLocation = z.infer<typeof flagSideLocationSchema>

export const flagSideRuleSchema = citedSchema.extend({ location: flagSideLocationSchema })
export type FlagSideRule = z.infer<typeof flagSideRuleSchema>

const flagSide = (location: FlagSideLocation, interpretation = false): FlagSideRule => ({
  location,
  sources: [iofDescriptions(DESCRIPTION_LOCATIONS[location].ref)],
  interpretation,
})

export const FEATURE_FLAG_SIDES: Readonly<Partial<Record<DescriptionFeature, FlagSideRule>>> = {
  hill: flagSide('directionalFoot'),
  knoll: flagSide('directionalFoot'),
  antHill: flagSide('side'),
  rockPillar: flagSide('directionalFoot'),
  boulder: flagSide('side'),
  boulderCluster: flagSide('side'),
  thicket: flagSide('side'),
  copse: flagSide('side', true),
  prominentTree: flagSide('side', true),
  prominentVegetationFeature: flagSide('side'),
  well: flagSide('side'),
  waterTank: flagSide('side'),
  building: flagSide('side'),
  ruin: flagSide('side'),
  tower: flagSide('side'),
  cairn: flagSide('side'),
  fodderRack: flagSide('side'),
  monument: flagSide('side', true),
  depression: flagSide('edge'),
  smallDepression: flagSide('edge'),
  pit: flagSide('edge'),
  waterhole: flagSide('edge'),
  pond: flagSide('edge'),
  spring: flagSide('edge'),
  marsh: flagSide('edge'),
  boulderField: flagSide('edge'),
  stonyGround: flagSide('edge'),
  clearing: flagSide('edge'),
}

export const hiddenFlagSideRuleSchema = citedSchema.extend({
  difficultyStep: z.int().positive(),
})

export const HIDDEN_FLAG_SIDE: z.infer<typeof hiddenFlagSideRuleSchema> = {
  difficultyStep: 1,
  sources: [iofDescriptions('12.1'), iofRules('App. 2 §3.5.3'), ratamestarikirja('1.2.5')],
  interpretation: true,
}
