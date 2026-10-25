import type { PaperPoint } from '@ratamestari/core'
import { MAP_APPEARANCES, type Appearance, type Ink } from '@ratamestari/rules'
import { centreOf, chainDashes, type Chain } from './chains'
import type { PaperFeature } from './classify'
import { boxOf, distanceToPolyline, logRatio, median, pathLength } from './shapes'

type Line = Extract<Appearance, { draw: 'line' }> & { code: string }

const LINES: readonly Line[] = MAP_APPEARANCES.flatMap(({ code, appearance }) =>
  appearance.draw === 'line' ? [{ ...appearance, code }] : [],
)
const NORTH_LINE_CODE = '601'

// Interpretation: tolerances for reading lines. ISOM lets dashes shrink to 0.8 × nominal and keeps
// gaps fixed (§2.11.3); producers print gaps a little off too.
const WIDTH_TOLERANCE = 0.3
const DASH_SHARE = { min: 0.6, max: 1.35 }
const GAP_SHARE = { min: 0.4, max: 2.5 }
const MAX_DASH_GAP_MM = 0.6
const MIN_LINE_MM = 0.6
const MAX_TAG_MM = 0.6
const MIN_TAG_SHARE = 0.4
// North lines (601) are 20 mm apart (sym. 601) and run across the map, broken only over small
// features, so a straight line of pieces longer than that spacing is one.
const MIN_NORTH_LINE_MM = 20
const STRAIGHT_SINE = 0.003
const NORTH_LINE_OFFSET_MM = 0.15
const NORTH_LINE_ANGLE_RADIANS = 0.003
const EDGE_CLEARANCE_MM = 0.1

export interface LinePiece {
  readonly ink: Ink
  readonly widthMm: number
  readonly pdfDash: readonly number[]
  readonly points: readonly PaperPoint[]
}

interface ChainReading {
  readonly ink: Ink
  readonly widthMm: number
  readonly points: readonly PaperPoint[]
  readonly lengthMm: number
  readonly dash: { readonly dashMm: number; readonly gapMm: number } | null
  readonly tagsPerMm: number
}

export function readLines(
  pieces: readonly LinePiece[],
  toMm: (paperUnits: number) => number,
): PaperFeature[] {
  const tags = new TagIndex(
    pieces.filter(piece => toMm(pathLength(piece.points)) <= MAX_TAG_MM),
    MAX_TAG_MM / toMm(1),
  )
  const groups = new Map<string, LinePiece[]>()
  for (const piece of pieces) {
    const key = `${piece.ink}:${piece.widthMm.toFixed(2)}`
    groups.set(key, [...(groups.get(key) ?? []), piece])
  }
  const maxGap = MAX_DASH_GAP_MM / toMm(1)
  const chains: ChainReading[] = [...groups.values()].flatMap(group =>
    chainDashes(group, maxGap).flatMap(chain => {
      const reading = readChain(chain, group, tags, toMm)
      return reading.lengthMm >= MIN_LINE_MM ? [reading] : []
    }),
  )
  const northLines = findNorthLines(chains, toMm)
  const codes = new Map(
    chains.map(chain => [chain, northLines.has(chain) ? NORTH_LINE_CODE : lineCode(chain)]),
  )
  const edges = edgesOf(chains, codes, toMm)
  return chains.flatMap(chain => {
    const code = codes.get(chain)
    if (!code || edges.has(chain)) return []
    return [{ isomCode: code, geometry: { type: 'LineString', coordinates: chain.points } }]
  })
}

// The thin side lines of a wide road (502) are part of the road, not lines of their own.
function edgesOf(
  chains: readonly ChainReading[],
  codes: ReadonlyMap<ChainReading, string | null>,
  toMm: (paperUnits: number) => number,
): Set<ChainReading> {
  const edged = chains.flatMap(chain => {
    const line = LINES.find(
      candidate => candidate.code === codes.get(chain) && candidate.edgeWidthMm !== undefined,
    )
    return line?.edgeWidthMm ? [{ chain, edgeWidthMm: line.edgeWidthMm }] : []
  })
  const edges = new Set<ChainReading>()
  for (const candidate of chains) {
    for (const { chain, edgeWidthMm } of edged) {
      if (Math.abs(candidate.widthMm - edgeWidthMm) > edgeWidthMm * WIDTH_TOLERANCE) continue
      const reach = chain.widthMm / 2 + candidate.widthMm + EDGE_CLEARANCE_MM
      const alongside = candidate.points.every(
        point => toMm(distanceToPolyline(point, chain.points)) <= reach,
      )
      if (alongside) edges.add(candidate)
    }
  }
  return edges
}

function readChain(
  chain: Chain,
  group: readonly LinePiece[],
  tags: TagIndex,
  toMm: (paperUnits: number) => number,
): ChainReading {
  const { ink, widthMm, pdfDash } = group[chain.pieceIndices[0]!]!
  const lengthMm = toMm(pathLength(chain.points))
  const pieces = chain.pieceIndices.map(index => group[index]!.points)
  const inner = pieces.length >= 3 ? pieces.slice(1, -1) : pieces
  const gaps = pieces.slice(1).map((piece, i) => toMm(gapBetween(pieces[i]!, piece)))
  const dash =
    pieces.length >= 2
      ? { dashMm: median(inner.map(points => toMm(pathLength(points)))), gapMm: median(gaps) }
      : pdfDash.length >= 2
        ? { dashMm: pdfDash[0]!, gapMm: pdfDash[1]! }
        : null
  const ownPieces = new Set(chain.pieceIndices.map(index => group[index]!))
  const nearTags = tags
    .near(chain.points)
    .filter(
      tag =>
        tag.piece.ink === ink &&
        !ownPieces.has(tag.piece) &&
        toMm(distanceToPolyline(tag.centre, chain.points)) <= MAX_TAG_MM,
    ).length
  return { ink, widthMm, points: chain.points, lengthMm, dash, tagsPerMm: nearTags / lengthMm }
}

function lineCode(chain: ChainReading): string | null {
  const matching = (dashed: boolean) => {
    let best: { code: string; error: number } | null = null
    for (const candidate of LINES) {
      if (candidate.ink !== chain.ink || candidate.code === NORTH_LINE_CODE) continue
      const widthError =
        candidate.widthIsMinimum && chain.widthMm >= candidate.widthMm
          ? 0
          : Math.abs(chain.widthMm - candidate.widthMm) / candidate.widthMm
      if (widthError > WIDTH_TOLERANCE) continue
      if (dashed !== (candidate.dash !== null)) continue
      if (candidate.dash && !fitsDash(chain.dash, candidate.dash)) continue
      const tagged = candidate.tagEveryMm !== undefined
      const hasTags = chain.tagsPerMm >= MIN_TAG_SHARE / (candidate.tagEveryMm ?? 0.5)
      if (tagged !== hasTags) continue
      const error =
        widthError +
        (candidate.dash && chain.dash ? logRatio(chain.dash.dashMm, candidate.dash.dashMm) : 0)
      if (!best || error < best.error) best = { code: candidate.code, error }
    }
    return best?.code ?? null
  }
  // A solid line broken into pieces (over other features, or at the clip) looks dashed but
  // fits no dash pattern.
  return (chain.dash ? matching(true) : null) ?? matching(false)
}

function fitsDash(
  measured: ChainReading['dash'],
  nominal: { readonly dashMm: number; readonly gapMm: number },
): boolean {
  if (!measured) return false
  const dashShare = measured.dashMm / nominal.dashMm
  const gapShare = measured.gapMm / nominal.gapMm
  return (
    dashShare >= DASH_SHARE.min &&
    dashShare <= DASH_SHARE.max &&
    gapShare >= GAP_SHARE.min &&
    gapShare <= GAP_SHARE.max
  )
}

function findNorthLines(chains: readonly ChainReading[], toMm: (paperUnits: number) => number) {
  const northLines = LINES.filter(candidate => candidate.code === NORTH_LINE_CODE)
  const straight = chains.filter(
    chain =>
      northLines.some(
        line =>
          line.ink === chain.ink &&
          Math.abs(chain.widthMm - line.widthMm) <= line.widthMm * WIDTH_TOLERANCE,
      ) && isStraight(chain.points),
  )
  const found = new Set<ChainReading>()
  const groups: { angle: number; offsetMm: number; members: ChainReading[] }[] = []
  for (const chain of straight) {
    const [start, end] = [chain.points[0]!, chain.points[chain.points.length - 1]!]
    let angle = Math.atan2(end[1] - start[1], end[0] - start[0])
    if (angle < 0) angle += Math.PI
    if (angle >= Math.PI) angle -= Math.PI
    const offsetMm = toMm(-start[0] * Math.sin(angle) + start[1] * Math.cos(angle))
    const group = groups.find(
      candidate =>
        Math.abs(candidate.angle - angle) <= NORTH_LINE_ANGLE_RADIANS &&
        Math.abs(candidate.offsetMm - offsetMm) <= NORTH_LINE_OFFSET_MM,
    )
    if (group) group.members.push(chain)
    else groups.push({ angle, offsetMm, members: [chain] })
  }
  for (const { angle, members } of groups) {
    const along = members.flatMap(chain =>
      chain.points.map(([x, y]) => toMm(x * Math.cos(angle) + y * Math.sin(angle))),
    )
    if (Math.max(...along) - Math.min(...along) >= MIN_NORTH_LINE_MM) {
      for (const member of members) found.add(member)
    }
  }
  return found
}

function isStraight(points: readonly PaperPoint[]): boolean {
  const [start, end] = [points[0]!, points[points.length - 1]!]
  const length = Math.hypot(end[0] - start[0], end[1] - start[1])
  if (length === 0) return false
  const box = boxOf(points)
  const largestOffset = Math.max(
    ...points.map(
      ([x, y]) =>
        Math.abs((end[0] - start[0]) * (start[1] - y) - (start[0] - x) * (end[1] - start[1])) /
        length,
    ),
  )
  return largestOffset <= Math.max(box.width, box.height) * STRAIGHT_SINE + 1
}

function gapBetween(a: readonly PaperPoint[], b: readonly PaperPoint[]): number {
  const ends = [a[0]!, a[a.length - 1]!]
  const starts = [b[0]!, b[b.length - 1]!]
  return Math.min(
    ...ends.flatMap(end => starts.map(start => Math.hypot(start[0] - end[0], start[1] - end[1]))),
  )
}

class TagIndex {
  private readonly buckets = new Map<string, { piece: LinePiece; centre: PaperPoint }[]>()

  constructor(
    tags: readonly LinePiece[],
    private readonly cell: number,
  ) {
    for (const piece of tags) {
      const centre = centreOf(piece.points)
      const key = this.keyOf(centre[0], centre[1])
      this.buckets.set(key, [...(this.buckets.get(key) ?? []), { piece, centre }])
    }
  }

  near(points: readonly PaperPoint[]) {
    const box = boxOf(points)
    const found: { piece: LinePiece; centre: PaperPoint }[] = []
    const [fromX, toX] = [box.minX - this.cell, box.minX + box.width + this.cell].map(v =>
      Math.floor(v / this.cell),
    )
    const [fromY, toY] = [box.minY - this.cell, box.minY + box.height + this.cell].map(v =>
      Math.floor(v / this.cell),
    )
    for (let x = fromX!; x <= toX!; x++) {
      for (let y = fromY!; y <= toY!; y++) found.push(...(this.buckets.get(`${x},${y}`) ?? []))
    }
    return found
  }

  private keyOf(x: number, y: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`
  }
}
