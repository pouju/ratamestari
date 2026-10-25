import { paperPoint, type PaperPoint } from '@ratamestari/core'

export interface ChainPiece {
  readonly points: readonly PaperPoint[]
}

export interface Chain {
  readonly points: readonly PaperPoint[]
  readonly pieceIndices: readonly number[]
}

const MIN_CONTINUITY_COSINE = Math.cos(Math.PI / 3)
const TANGENT_SPAN = 3

interface End {
  readonly piece: number
  readonly atStart: boolean
  readonly point: PaperPoint
  readonly outward: readonly [number, number]
}

// Joins the dashes of one dashed line: each piece end links to the nearest end of another piece
// that continues in the same direction, when both are each other's best match.
export function chainDashes(pieces: readonly ChainPiece[], maxGap: number): Chain[] {
  const ends = pieces.flatMap((piece, index): End[] => {
    if (piece.points.length < 2) return []
    return [endOf(piece.points, index, true), endOf(piece.points, index, false)]
  })
  const buckets = new Map<string, number[]>()
  const bucketOf = ([x, y]: PaperPoint) => `${Math.floor(x / maxGap)},${Math.floor(y / maxGap)}`
  ends.forEach((end, index) => {
    const key = bucketOf(end.point)
    buckets.set(key, [...(buckets.get(key) ?? []), index])
  })

  const bestMatch = ends.map((end, index) => {
    const [bx, by] = [Math.floor(end.point[0] / maxGap), Math.floor(end.point[1] / maxGap)]
    let best: { other: number; score: number } | null = null
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          const candidate = ends[other]!
          if (candidate.piece === end.piece) continue
          const score = continuationScore(end, candidate, maxGap)
          if (score !== null && (!best || score < best.score)) best = { other, score }
        }
      }
    }
    return best?.other ?? null
  })

  const linkedEnd = ends.map((_, index) => {
    const other = bestMatch[index]
    return other !== null && other !== undefined && bestMatch[other] === index ? other : null
  })
  const endIndices = new Map<string, number>()
  ends.forEach((end, index) => endIndices.set(`${end.piece}:${end.atStart}`, index))
  const endOfPiece = (piece: number, atStart: boolean) => endIndices.get(`${piece}:${atStart}`)!

  const used = new Set<number>()
  const chains: Chain[] = []
  pieces.forEach((piece, index) => {
    if (used.has(index) || piece.points.length < 2) return
    let first = index
    let firstAtStart = true
    const seen = new Set([index])
    for (;;) {
      const link: number | null | undefined = linkedEnd[endOfPiece(first, firstAtStart)]
      if (link === null || link === undefined) break
      const previous: End = ends[link]!
      if (seen.has(previous.piece)) break
      seen.add(previous.piece)
      first = previous.piece
      firstAtStart = !previous.atStart
    }

    const points: PaperPoint[] = []
    const pieceIndices: number[] = []
    let current = first
    let enterAtStart = firstAtStart
    for (;;) {
      used.add(current)
      pieceIndices.push(current)
      const piecePoints = pieces[current]!.points
      points.push(...(enterAtStart ? piecePoints : [...piecePoints].reverse()))
      const link = linkedEnd[endOfPiece(current, !enterAtStart)]
      if (link === null || link === undefined) break
      const next = ends[link]!
      if (used.has(next.piece)) break
      current = next.piece
      enterAtStart = next.atStart
    }
    chains.push({ points, pieceIndices })
  })
  return chains
}

// Joins dots into dotted lines: each dot links to its two nearest neighbours on opposite sides.
export function chainDots(centres: readonly PaperPoint[], maxSpacing: number): Chain[] {
  const buckets = new Map<string, number[]>()
  const bucketOf = ([x, y]: PaperPoint) =>
    `${Math.floor(x / maxSpacing)},${Math.floor(y / maxSpacing)}`
  centres.forEach((centre, index) => {
    const key = bucketOf(centre)
    buckets.set(key, [...(buckets.get(key) ?? []), index])
  })
  const neighbours = centres.map((centre, index) => {
    const [bx, by] = [Math.floor(centre[0] / maxSpacing), Math.floor(centre[1] / maxSpacing)]
    const near: { other: number; distance: number }[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          if (other === index) continue
          const distance = length(centre, centres[other]!)
          if (distance <= maxSpacing) near.push({ other, distance })
        }
      }
    }
    near.sort((a, b) => a.distance - b.distance)
    const [nearest] = near
    if (!nearest) return []
    const towards = direction(centre, centres[nearest.other]!)
    const opposite = near.find(({ other }) => {
      const away = direction(centre, centres[other]!)
      return towards[0] * away[0] + towards[1] * away[1] < -MIN_CONTINUITY_COSINE
    })
    return opposite ? [nearest.other, opposite.other] : [nearest.other]
  })
  const linked = neighbours.map((list, index) =>
    list.filter(other => neighbours[other]!.includes(index)),
  )

  const used = new Set<number>()
  const chains: Chain[] = []
  centres.forEach((_, index) => {
    if (used.has(index)) return
    let first = index
    let previous = -1
    const seen = new Set([index])
    for (;;) {
      const next = linked[first]!.find(other => other !== previous && !seen.has(other))
      if (next === undefined) break
      seen.add(next)
      previous = first
      first = next
    }
    const pieceIndices: number[] = []
    let current: number | undefined = first
    previous = -1
    while (current !== undefined && !used.has(current)) {
      used.add(current)
      pieceIndices.push(current)
      const next: number | undefined = linked[current]!.find(
        other => other !== previous && !used.has(other),
      )
      previous = current
      current = next
    }
    chains.push({ points: pieceIndices.map(i => centres[i]!), pieceIndices })
  })
  return chains
}

function endOf(points: readonly PaperPoint[], piece: number, atStart: boolean): End {
  const point = atStart ? points[0]! : points[points.length - 1]!
  const inner = atStart
    ? points[Math.min(TANGENT_SPAN, points.length - 1)]!
    : points[Math.max(0, points.length - 1 - TANGENT_SPAN)]!
  return { piece, atStart, point, outward: direction(inner, point) }
}

function continuationScore(end: End, candidate: End, maxGap: number): number | null {
  const gap = length(end.point, candidate.point)
  if (gap > maxGap) return null
  const facing = -(end.outward[0] * candidate.outward[0] + end.outward[1] * candidate.outward[1])
  if (facing < MIN_CONTINUITY_COSINE) return null
  if (gap > 0) {
    const across = direction(end.point, candidate.point)
    if (end.outward[0] * across[0] + end.outward[1] * across[1] < MIN_CONTINUITY_COSINE) return null
  }
  return gap / maxGap + (1 - facing)
}

function direction(from: PaperPoint, to: PaperPoint): readonly [number, number] {
  const distance = length(from, to)
  return distance === 0 ? [0, 0] : [(to[0] - from[0]) / distance, (to[1] - from[1]) / distance]
}

const length = (a: PaperPoint, b: PaperPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

export const centreOf = (points: readonly PaperPoint[]): PaperPoint =>
  paperPoint(
    points.reduce((sum, [x]) => sum + x, 0) / points.length,
    points.reduce((sum, [, y]) => sum + y, 0) / points.length,
  )
