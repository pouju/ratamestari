import type { PaperPoint } from '@ratamestari/core'
import { MAP_APPEARANCES, type Appearance, type Ink } from '@ratamestari/rules'
import { inkOf } from './inks'
import type { PdfPaint } from './pdf-paths'
import { boxOf, distanceToPolyline, logRatio, median, pathLength } from './shapes'

type Pattern = Extract<Appearance, { draw: 'pattern' }> & { code: string }

const PATTERNS: readonly Pattern[] = MAP_APPEARANCES.flatMap(({ code, appearance }) =>
  appearance.draw === 'pattern' ? [{ ...appearance, code }] : [],
)

// Interpretation: tolerances for reading a pattern tile.
const SAME_LINE_MM = 0.03
const MIN_CONNECTED_ENDS = 0.8
const PARALLEL_SINE = 0.05
const LATTICE_REACH = 2

export interface PatternReading {
  readonly code: string
  // Whether the pattern stands for the whole symbol, so a flat fill under it is part of it.
  readonly includesBackground: boolean
}

const strokeReadings = new WeakMap<object, ReturnType<typeof strokeElements>>()
const strokeReadingsBySignature = new Map<string, ReturnType<typeof strokeElements>>()

export function readPattern(
  fill: Extract<PdfPaint, { kind: 'pattern' }>,
  background: Ink | null,
  toMm: (paperUnits: number) => number,
): PatternReading | null {
  const inked = fill.tile.flatMap(element => {
    const ink = inkOf(element.stroke ?? element.fill)
    return ink ? [{ element, ink }] : []
  })
  const [first] = inked
  if (!first) return null
  const [a, b] = fill.lattice
  const tileAreaMm = toMm(toMm(Math.abs(a[0] * b[1] - a[1] * b[0])))
  const elements = inked.map(({ element }) => element.subpaths.flatMap(({ points }) => points))
  const reading =
    first.element.stroke === null
      ? {
          element: 'dots' as const,
          spacingMm: Math.sqrt(tileAreaMm / inked.length),
          dotMm: toMm(Math.max(boxOf(elements[0]!).width, boxOf(elements[0]!).height)),
        }
      : cachedStrokeElements(fill, elements, toMm)

  let best: { candidate: Pattern; error: number } | null = null
  for (const candidate of PATTERNS) {
    if (candidate.ink !== first.ink || candidate.element !== reading.element) continue
    if (candidate.on && background !== null && candidate.on !== background) continue
    const dotError =
      'dotMm' in reading && candidate.dotMm ? logRatio(reading.dotMm, candidate.dotMm) : 0
    const error = logRatio(reading.spacingMm, candidate.spacingMm) + dotError
    if (!best || error < best.error) best = { candidate, error }
  }
  return best
    ? { code: best.candidate.code, includesBackground: best.candidate.on !== undefined }
    : null
}

function cachedStrokeElements(
  fill: Extract<PdfPaint, { kind: 'pattern' }>,
  elements: readonly (readonly PaperPoint[])[],
  toMm: (paperUnits: number) => number,
) {
  const known = strokeReadings.get(fill)
  if (known) return known
  const signature = JSON.stringify([
    toMm(1),
    fill.lattice.map(vector => vector.map(Math.round)),
    elements.map(points => points.map(([x, y]) => [Math.round(x), Math.round(y)])),
  ])
  const reading =
    strokeReadingsBySignature.get(signature) ?? strokeElements(elements, fill.lattice, toMm)
  strokeReadingsBySignature.set(signature, reading)
  strokeReadings.set(fill, reading)
  return reading
}

// Lines continue from one element (or tile) into the next; dashes leave gaps. Spacing is the
// distance between neighbouring parallel lines, also across tiles.
function strokeElements(
  elements: readonly (readonly PaperPoint[])[],
  [a, b]: readonly [readonly [number, number], readonly [number, number]],
  toMm: (paperUnits: number) => number,
): { element: 'lines' | 'dashes'; spacingMm: number } {
  const longest = elements.reduce((x, y) => (pathLength(y) > pathLength(x) ? y : x))
  const [start, end] = [longest[0]!, longest[longest.length - 1]!]
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1
  const along = [(end[0] - start[0]) / length, (end[1] - start[1]) / length] as const
  const normal = [-along[1], along[0]] as const

  const shifts: (readonly [number, number])[] = []
  for (let i = -LATTICE_REACH; i <= LATTICE_REACH; i++) {
    for (let j = -LATTICE_REACH; j <= LATTICE_REACH; j++) {
      shifts.push([i * a[0] + j * b[0], i * a[1] + j * b[1]])
    }
  }
  const copies = elements.flatMap((points, index) =>
    shifts.map(([dx, dy]) => ({
      index,
      shifted: dx !== 0 || dy !== 0,
      points: points.map(([x, y]) => [x + dx, y + dy] as unknown as PaperPoint),
    })),
  )
  const parallel = (points: readonly PaperPoint[]) => {
    const [p, q] = [points[0]!, points[points.length - 1]!]
    const span = Math.hypot(q[0] - p[0], q[1] - p[1])
    return (
      span === 0 ||
      Math.abs(((q[0] - p[0]) * normal[0] + (q[1] - p[1]) * normal[1]) / span) < PARALLEL_SINE
    )
  }
  const tolerance = SAME_LINE_MM / toMm(1)
  const cell = tolerance * 4
  const buckets = new Map<string, number[]>()
  copies.forEach((copy, index) => {
    if (!parallel(copy.points)) return
    const box = boxOf(copy.points)
    const [fromX, toX] = [box.minX - tolerance, box.minX + box.width + tolerance].map(v =>
      Math.floor(v / cell),
    )
    const [fromY, toY] = [box.minY - tolerance, box.minY + box.height + tolerance].map(v =>
      Math.floor(v / cell),
    )
    for (let x = fromX!; x <= toX!; x++) {
      for (let y = fromY!; y <= toY!; y++) {
        const key = `${x},${y}`
        buckets.set(key, [...(buckets.get(key) ?? []), index])
      }
    }
  })
  let ends = 0
  let connected = 0
  elements.forEach((points, index) => {
    const [first, last] = [points[0]!, points[points.length - 1]!]
    for (const [endPoint, inner] of [
      [first, last],
      [last, first],
    ] as const) {
      ends++
      const outward = [endPoint[0] - inner[0], endPoint[1] - inner[1]] as const
      const nearby =
        buckets.get(`${Math.floor(endPoint[0] / cell)},${Math.floor(endPoint[1] / cell)}`) ?? []
      // Another element continues the line only if it reaches past this end; an identical
      // element drawn twice does not.
      const continues = nearby.some(copyIndex => {
        const copy = copies[copyIndex]!
        return (
          (copy.index !== index || copy.shifted) &&
          toMm(distanceToPolyline(endPoint, copy.points)) <= SAME_LINE_MM &&
          copy.points.some(
            ([x, y]) =>
              toMm(
                ((x - endPoint[0]) * outward[0] + (y - endPoint[1]) * outward[1]) /
                  Math.hypot(...outward),
              ) > SAME_LINE_MM,
          )
        )
      })
      if (continues) connected++
    }
  })

  const offsets = copies
    .filter(copy => parallel(copy.points))
    .map(({ points }) => {
      const middle = points[Math.floor(points.length / 2)]!
      return toMm(middle[0] * normal[0] + middle[1] * normal[1])
    })
    .sort((x, y) => x - y)
  const distinct = offsets.filter((offset, i) => i === 0 || offset - offsets[i - 1]! > SAME_LINE_MM)
  const gaps = distinct.slice(1).map((offset, i) => offset - distinct[i]!)
  return {
    element: connected / ends >= MIN_CONNECTED_ENDS ? 'lines' : 'dashes',
    spacingMm: median(gaps),
  }
}
