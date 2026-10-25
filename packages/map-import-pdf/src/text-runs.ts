import type { PaperPoint } from '@ratamestari/core'
import type { Ink } from '@ratamestari/rules'
import { inkOf } from './inks'
import type { PdfPageContent } from './pdf-paths'
import { boxOf, type Box } from './shapes'

export interface Glyph {
  readonly pathIndex: number
  readonly box: Box
  readonly curved: boolean
}

// A row of letters or digits drawn as outlines, as map titles, place names and control codes
// are in OCAD and Condes exports.
export interface TextRun {
  readonly glyphs: readonly Glyph[]
  readonly box: Box
  readonly height: number
}

const PAPER_UNITS_PER_MM = 100
// Interpretation: what a printed character looks like next to its neighbours.
const GLYPH_HEIGHT_MM = { min: 0.7, max: 15 }
const MAX_GLYPH_ASPECT = 1.6
const MIN_GLYPH_POINTS = 6
const SAME_HEIGHT_SHARE = 0.4
const SAME_BASELINE_SHARE = 0.25
const MAX_GAP_SHARE = 0.7
const MIN_RUN_GLYPHS = 3
const MIN_CURVED_SHARE = 0.5
// Text is printed in full-strength inks, never in the screens that areas use.
const TEXT_INKS = new Set<Ink>(['black', 'brown', 'blue', 'purple'])

export function findTextRuns(page: PdfPageContent, excluded: ReadonlySet<number>): TextRun[] {
  const glyphs = page.paths.flatMap((path, pathIndex): Glyph[] => {
    if (excluded.has(pathIndex) || !path.fill || path.stroke) return []
    const ink = inkOf(path.fill)
    if (!ink || !TEXT_INKS.has(ink)) return []
    const points = path.subpaths.flatMap(subpath => subpath.points)
    if (points.length < MIN_GLYPH_POINTS) return []
    const box = boxOf(points)
    const heightMm = box.height / PAPER_UNITS_PER_MM
    if (heightMm < GLYPH_HEIGHT_MM.min || heightMm > GLYPH_HEIGHT_MM.max) return []
    if (box.width > box.height * MAX_GLYPH_ASPECT) return []
    return [{ pathIndex, box, curved: path.subpaths.some(subpath => subpath.curved) }]
  })

  const byLeft = [...glyphs].sort((a, b) => a.box.minX - b.box.minX)
  const next = new Map<Glyph, Glyph>()
  const hasPrevious = new Set<Glyph>()
  for (const glyph of byLeft) {
    const right = glyph.box.minX + glyph.box.width
    const follower = byLeft.find(
      other =>
        other !== glyph &&
        !hasPrevious.has(other) &&
        other.box.minX >= right - glyph.box.width * 0.2 &&
        other.box.minX - right <= glyph.box.height * MAX_GAP_SHARE &&
        sameLine(glyph, other),
    )
    if (follower) {
      next.set(glyph, follower)
      hasPrevious.add(follower)
    }
  }

  return byLeft.flatMap(first => {
    if (hasPrevious.has(first)) return []
    const run = [first]
    for (let glyph = next.get(first); glyph; glyph = next.get(glyph)) run.push(glyph)
    if (run.length < MIN_RUN_GLYPHS) return []
    if (run.filter(glyph => glyph.curved).length < run.length * MIN_CURVED_SHARE) return []
    const box = boxOf(run.flatMap(({ box: b }) => corners(b)))
    return [{ glyphs: run, box, height: Math.max(...run.map(glyph => glyph.box.height)) }]
  })
}

// Letters differ in height (x-height, capitals, descenders), so the bottoms of most of them, or
// the tops, line up.
function sameLine(a: Glyph, b: Glyph): boolean {
  const height = Math.max(a.box.height, b.box.height)
  if (Math.abs(a.box.height - b.box.height) > height * SAME_HEIGHT_SHARE * 1.5) return false
  const bottoms = Math.abs(a.box.minY - b.box.minY)
  const tops = Math.abs(a.box.minY + a.box.height - (b.box.minY + b.box.height))
  return Math.min(bottoms, tops) <= height * SAME_BASELINE_SHARE
}

const corners = (box: Box): PaperPoint[] =>
  [
    [box.minX, box.minY],
    [box.minX + box.width, box.minY + box.height],
  ] as unknown as PaperPoint[]
