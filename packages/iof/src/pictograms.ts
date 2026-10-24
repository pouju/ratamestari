import type {
  DescriptionAppearance,
  DescriptionFeature,
  DescriptionLocation,
} from '@ratamestari/rules'

// Our own drawings of the IOF symbols, in a 100 × 100 box with y down.
// Shapes follow the IOF Control Descriptions 2024 pictograms; the spec's
// own artwork is CC BY-ND, so it is not copied.

const line = (d: string) => `<path d="${d}" fill="none"/>`
const solid = (d: string) => `<path d="${d}" fill="currentColor" stroke="none"/>`
const circle = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"/>`
const dot = (cx: number, cy: number, r = 6) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`
const dots = (points: readonly (readonly [number, number])[], r = 3.5) =>
  points.map(([x, y]) => dot(x, y, r)).join('')
const dotsAlong = (x1: number, y1: number, x2: number, y2: number, count: number, r = 3.5) =>
  dots(
    Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1)
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t] as const
    }),
    r,
  )
const triangle = (cx: number, baseY: number, halfWidth: number, height: number) =>
  solid(`M${cx} ${baseY - height} L${cx + halfWidth} ${baseY} L${cx - halfWidth} ${baseY} Z`)
const wave = (x: number, y: number, segments: number, width = 12, height = 7) =>
  line(
    `M${x} ${y}` +
      Array.from(
        { length: segments },
        (_, i) => ` q${width / 2} ${i % 2 ? height : -height} ${width} 0`,
      ).join(''),
  )
const diagonalWave = line(
  'M18 82 q2 -14 14 -12 q12 2 14 -12 q2 -14 14 -12 q12 2 14 -12 q2 -10 8 -12',
)
const thicketLattice = [-20, 0, 20]
  .flatMap(o => [
    `M${30 + o} ${30 - o} L${70 + o} ${70 - o}`,
    `M${30 + o} ${70 + o} L${70 + o} ${30 + o}`,
  ])
  .map(line)
  .join('')
const tree = (cx: number, top: number, halfWidth: number, height: number, stem: number) =>
  line(
    `M${cx} ${top} L${cx + halfWidth} ${top + height} H${cx - halfWidth} Z M${cx} ${top + height} V${top + height + stem}`,
  )

export const FEATURE_PICTOGRAMS: Readonly<Record<DescriptionFeature, string>> = {
  terrace: line('M26 12 V88 M42 12 Q42 32 60 32 H76 V68 H60 Q42 68 42 88'),
  spur: line('M26 12 V88 M42 12 Q42 40 80 50 Q42 60 42 88'),
  reEntrant: line('M22 88 Q36 80 36 46 Q36 14 50 14 Q64 14 64 46 Q64 80 78 88'),
  earthBank: line('M14 40 Q50 22 86 40 M24 36 V56 M40 31 V51 M60 31 V51 M76 36 V56'),
  quarry: line('M30 82 A32 32 0 1 1 70 82 M50 22 V38 M28 34 L38 44 M72 34 L62 44'),
  earthWall: line('M10 50 H90 M30 34 V66 M44 34 V66 M58 34 V66 M72 34 V66'),
  erosionGully: line('M26 86 L50 14 L74 86'),
  smallErosionGully:
    line('M24 24 L76 76') + dotsAlong(40, 14, 86, 60, 5) + dotsAlong(14, 40, 60, 86, 5),
  hill: '<ellipse cx="50" cy="50" rx="36" ry="22" fill="none"/>',
  knoll: dot(50, 50, 17),
  saddle: line('M34 14 Q56 50 34 86 M66 14 Q44 50 66 86'),
  depression: '<ellipse cx="50" cy="50" rx="36" ry="22" fill="none"/>' + line('M24 50 H76'),
  smallDepression: line('M28 24 V50 Q28 78 50 78 Q72 78 72 50 V24'),
  pit: line('M26 20 L50 80 L74 20'),
  brokenGround: line(
    'M20 26 V34 Q20 44 29 44 Q38 44 38 34 V26 M62 26 V34 Q62 44 71 44 Q80 44 80 34 V26 M41 58 V66 Q41 76 50 76 Q59 76 59 66 V58',
  ),
  antHill: line('M50 14 V86 M14 50 H86 M24 24 L76 76 M76 24 L24 76'),
  cliff: line('M14 34 H86 M20 34 V62 M40 34 V62 M60 34 V62 M80 34 V62'),
  rockPillar: solid('M50 10 L64 90 L36 90 Z'),
  cave: line('M78 20 L28 50 L78 80 M50 30 V70'),
  boulder: triangle(50, 80, 36, 60),
  boulderField:
    triangle(30, 44, 16, 26) +
    triangle(70, 44, 16, 26) +
    triangle(30, 84, 16, 26) +
    triangle(70, 84, 16, 26),
  boulderCluster: solid('M14 78 L40 30 L64 78 Z M46 78 L68 44 L88 78 Z'),
  stonyGround: dots(
    [18, 34, 50, 66, 82].flatMap(y => [18, 34, 50, 66, 82].map(x => [x, y] as const)),
    3.5,
  ),
  bareRock: line(
    'M50 12 V36 M50 64 V88 M12 50 H36 M64 50 H88 M23 23 L38 38 M62 62 L77 77 M77 23 L62 38 M38 62 L23 77',
  ),
  narrowPassage: line('M24 14 H40 V86 H24 M76 14 H60 V86 H76'),
  trench: line('M12 30 H32 V76 H68 V30 H88'),
  lake: circle(50, 50, 36) + wave(28, 54, 4, 11, 9),
  pond: wave(24, 24, 4, 13, 8) + line('M30 44 V58 Q30 82 50 82 Q70 82 70 58 V44'),
  waterhole: wave(24, 24, 4, 13, 8) + line('M30 44 L50 84 L70 44'),
  stream: diagonalWave,
  ditch: diagonalWave + dotsAlong(14, 52, 48, 18, 4, 3) + dotsAlong(52, 82, 86, 48, 4, 3),
  narrowMarsh: dotsAlong(20, 80, 80, 20, 6, 4),
  marsh: line('M40 20 H60 M26 35 H74 M14 50 H86 M26 65 H74 M40 80 H60'),
  firmGroundInMarsh: line('M16 20 H84 M16 80 H84 M32 36 H20 V64 H32 M68 36 H80 V64 H68'),
  well: circle(50, 34, 18) + wave(26, 74, 4, 12, 8),
  spring: line('M34 50 A16 16 0 1 1 50 34') + line('M34 50 q4 14 16 14 q12 0 14 10 q2 10 14 12'),
  waterTank: wave(24, 24, 4, 13, 8) + line('M26 46 H74 V82 H26 Z'),
  openLand: line('M50 14 L86 50 L50 86 L14 50 Z'),
  semiOpenLand:
    dotsAlong(50, 14, 86, 50, 4) +
    dotsAlong(86, 50, 50, 86, 4) +
    dotsAlong(50, 86, 14, 50, 4) +
    dotsAlong(14, 50, 50, 14, 4),
  forestCorner: line('M56 16 L20 50 L56 84 L80 62 L52 50 L80 38 Z'),
  clearing: dots(
    Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * 2 * Math.PI
      return [50 + 34 * Math.cos(angle), 50 + 34 * Math.sin(angle)] as const
    }),
    4,
  ),
  thicket: thicketLattice,
  linearThicket: line('M18 82 L82 18') + circle(30, 70, 9) + circle(50, 50, 9) + circle(70, 30, 9),
  vegetationBoundary: dotsAlong(26, 16, 70, 50, 4) + dotsAlong(70, 50, 26, 84, 4),
  copse: tree(32, 16, 16, 50, 20) + tree(68, 16, 16, 50, 20),
  prominentTree: tree(50, 14, 20, 50, 22),
  prominentVegetationFeature: circle(50, 50, 32) + line('M28 28 L72 72 M72 28 L28 72'),
  road: '<path d="M18 82 L82 18" fill="none" stroke-width="12"/>',
  path: line('M16 84 L32 68 M42 58 L58 42 M68 32 L84 16'),
  ride: dotsAlong(14, 74, 74, 14, 6) + dotsAlong(26, 86, 86, 26, 6),
  bridge: line('M16 84 L84 16 M30 46 L44 46 L58 32 M42 70 L56 56 L70 56'),
  powerLine: line('M14 86 L86 14 M26 50 L50 74 M50 26 L74 50'),
  pylon:
    line('M14 86 L86 14 M62 18 L82 38') + circle(46, 54, 15) + line('M36 44 L56 64 M56 44 L36 64'),
  tunnel: line('M14 50 H86 M34 24 Q50 40 66 24 M34 76 Q50 60 66 76'),
  wall: line('M18 82 L82 18') + dot(32, 68, 8) + dot(50, 50, 8) + dot(68, 32, 8),
  fence: line('M18 82 L82 18 M32 68 L32 48 M50 50 L50 30 M68 32 L68 12'),
  crossingPoint: line('M14 50 H86 M40 18 V82 M60 18 V82'),
  building: solid('M22 22 H78 V78 H22 Z'),
  pavedArea: line('M22 22 H78 V78 H22 Z M22 50 L50 22 M22 78 L78 22 M50 78 L78 50'),
  ruin: line('M22 38 V22 H38 M62 22 H78 V38 M78 62 V78 H62 M38 78 H22 V62'),
  pipeline: line('M16 84 L84 16 M64 14 L72 28 L86 36 M48 30 L56 44 L70 52 M32 46 L40 60 L54 68'),
  tower: line('M18 20 H82 M50 20 V86'),
  shootingPlatform: line('M34 86 V20 H76'),
  cairn: circle(50, 50, 32) + dot(50, 50, 8),
  fodderRack: line('M50 18 V82 M34 82 H66 M36 32 L50 18 L64 32'),
  charcoalBurningGround: circle(50, 50, 34) + line('M50 26 L70 64 H30 Z'),
  monument: line('M50 16 L66 78 H34 Z M20 86 H80'),
  canopy: line('M18 20 H82 M32 20 V86 M68 20 V86'),
  stairway: line('M14 84 H32 V66 H50 V48 H68 V30 H86'),
  outOfBoundsArea:
    line('M18 18 H82 V82 H18 Z') +
    circle(50, 38, 8) +
    circle(38, 52, 8) +
    circle(62, 52, 8) +
    circle(50, 64, 8),
  railway: line(
    'M14 86 L86 14 M20 66 L34 80 M32 54 L46 68 M44 42 L58 56 M56 30 L70 44 M68 18 L82 32',
  ),
  specialItemCross: line('M22 22 L78 78 M78 22 L22 78'),
  specialItemCircle: circle(50, 50, 32),
}

export const APPEARANCE_PICTOGRAMS: Readonly<Record<DescriptionAppearance, string>> = {
  low: line('M14 62 Q50 30 86 62'),
  shallow: line('M14 40 Q50 72 86 40'),
  deep: line('M26 16 Q36 20 36 50 Q36 84 50 84 Q64 84 64 50 Q64 20 74 16'),
  overgrown: line('M20 34 H80 M20 50 H80 M20 66 H80 M34 20 V80 M50 20 V80 M66 20 V80'),
  open:
    dotsAlong(20, 20, 80, 20, 4) +
    dotsAlong(20, 80, 80, 80, 4) +
    dots([
      [20, 40],
      [20, 60],
      [80, 40],
      [80, 60],
    ]),
  rocky: triangle(32, 46, 15, 26) + triangle(68, 46, 15, 26) + triangle(50, 84, 15, 26),
  marshy: line('M24 34 H76 M24 50 H76 M24 66 H76'),
  sandy: dots(
    [
      [22, 22],
      [40, 18],
      [60, 24],
      [78, 20],
      [30, 36],
      [52, 38],
      [70, 34],
      [20, 52],
      [42, 50],
      [62, 54],
      [80, 48],
      [30, 66],
      [50, 68],
      [72, 64],
      [22, 80],
      [40, 82],
      [60, 78],
      [80, 82],
    ],
    3,
  ),
  needleLeaved: line('M50 12 L68 44 H32 Z M50 32 L72 70 H28 Z M50 70 V88'),
  broadLeaved: line(
    'M50 66 V88 M50 66 A13 13 0 1 1 34 48 A13 13 0 1 1 50 24 A13 13 0 1 1 66 48 A13 13 0 1 1 50 66',
  ),
  ruined: line('M26 86 V40 Q26 18 48 18 Q74 18 76 52 M64 44 L76 56 L86 42'),
}

export const LOCATION_PICTOGRAMS: Readonly<Record<DescriptionLocation, string>> = {
  side: circle(50, 60, 22) + dot(50, 22),
  edge: circle(50, 50, 30) + dot(50, 28),
  part: circle(50, 50, 30) + dot(50, 38),
  cornerInside: line('M22 66 L50 26 L78 66') + dot(50, 52),
  cornerOutside: line('M22 74 L50 36 L78 74') + dot(50, 18),
  tip: line('M38 84 L50 30 L62 84') + dot(50, 18),
  end: line('M50 86 V24 M30 24 H70'),
  upperPart: line('M34 16 V84 M66 16 V84') + dot(50, 30),
  lowerPart: line('M34 16 V84 M66 16 V84') + dot(50, 70),
  top: line('M30 86 V44 H70 V86') + dot(50, 24),
  foot: line('M32 16 V80 H80') + dot(50, 64),
  directionalFoot: circle(50, 60, 24) + line('M44 12 V28 H58'),
  beneath: line('M26 66 V34 H74 V66') + dot(50, 56),
  between: line('M18 30 H82 M18 70 H82') + dot(50, 50),
}

export const DIRECTION_ARROW = line('M50 86 V16 M30 36 L50 16 L70 36')
export const START_TRIANGLE = line('M50 16 L86 78 H14 Z')
