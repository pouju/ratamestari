import type { PaperPoint } from '@ratamestari/core'
import type { DescriptionTable } from './description-box'
import type { PdfPageContent } from './pdf-paths'
import { boxOf, type Box } from './shapes'

// Control codes on a printed course are outlined digits, not text. The description table's first
// column holds the control numbers 1, 2, 3…, which we know, so it teaches what each digit looks
// like in this file's font; the second column, the codes, is then read with what was learnt.
// IOF Control Descriptions 2024, p. 3: column A is the control number, column B the code.
const NUMBER_COLUMN = 0
const CODE_COLUMN = 1
const GRID = { columns: 8, rows: 12 }
const MAX_TOKEN_GLYPHS = 3
const MIN_GLYPH_HEIGHT_SHARE = 0.25
const MAX_GLYPH_HEIGHT_SHARE = 0.9
// Interpretation: a glyph is a digit when it differs from that digit's learnt shape in at most
// this share of the grid, and clearly more from every other digit.
const MAX_DIFFERENCE_SHARE = 0.15
const MIN_MARGIN_SHARE = 0.05
const SAME_ROW_SHARE = 0.5
const MAX_HEADER_ROWS = 4

interface Glyph {
  readonly box: Box
  readonly grid: Float32Array
}

// Codes for the controls in order, as far as the page shows the table and its digits can be
// told apart; null for the rest.
export function readControlCodes(
  page: PdfPageContent,
  table: DescriptionTable,
  controlCount: number,
): (string | null)[] {
  const rows = tableRows(page, table).filter(
    row =>
      row.number.length > 0 &&
      row.number.length <= MAX_TOKEN_GLYPHS &&
      row.code.length > 0 &&
      row.code.length <= MAX_TOKEN_GLYPHS,
  )
  // A header row (course name, length) can look like a numbered row, so the numbering may start a
  // few rows down: keep the start whose numbers read back as 1, 2, 3… with the tightest shapes.
  let best: { rows: TableRow[]; templates: Template[]; spread: number } | null = null
  for (let start = 0; start <= MAX_HEADER_ROWS && start < rows.length; start++) {
    const numbered = numberedRows(rows.slice(start), controlCount)
    if (numbered.length === 0) continue
    const templates = learnDigits(numbered)
    const readsBack = numbered.every(
      (row, i) => row.number.map(glyph => digitOf(glyph, templates)).join('') === String(i + 1),
    )
    if (!readsBack) continue
    const spread = shapeSpread(numbered, templates)
    if (
      !best ||
      numbered.length > best.rows.length ||
      (numbered.length === best.rows.length && spread < best.spread)
    ) {
      best = { rows: numbered, templates, spread }
    }
  }
  if (!best) return Array.from({ length: controlCount }, () => null)
  const { rows: controlRows, templates } = best

  return Array.from({ length: controlCount }, (_, i) => {
    const row = controlRows[i]
    if (!row) return null
    const digits = row.code.map(glyph => digitOf(glyph, templates))
    return digits.every(digit => digit !== null) ? digits.join('') : null
  })
}

interface Template {
  readonly digit: string
  readonly grid: Float32Array
}

function numberedRows(rows: readonly TableRow[], controlCount: number): TableRow[] {
  const numbered: TableRow[] = []
  for (const row of rows) {
    if (numbered.length === controlCount) break
    if (row.number.length !== String(numbered.length + 1).length) break
    numbered.push(row)
  }
  return numbered
}

function learnDigits(rows: readonly TableRow[]): Template[] {
  const sums = new Map<string, { grid: Float32Array; count: number }>()
  rows.forEach((row, i) => {
    String(i + 1)
      .split('')
      .forEach((digit, j) => {
        const known = sums.get(digit) ?? {
          grid: new Float32Array(GRID.columns * GRID.rows),
          count: 0,
        }
        row.number[j]!.grid.forEach((value, k) => (known.grid[k]! += value))
        known.count++
        sums.set(digit, known)
      })
  })
  return [...sums].map(([digit, { grid, count }]) => ({
    digit,
    grid: grid.map(value => value / count),
  }))
}

function shapeSpread(rows: readonly TableRow[], templates: readonly Template[]): number {
  const differences = rows.flatMap((row, i) =>
    String(i + 1)
      .split('')
      .map((digit, j) =>
        difference(row.number[j]!.grid, templates.find(t => t.digit === digit)!.grid),
      ),
  )
  return differences.reduce((sum, value) => sum + value, 0) / differences.length
}

const difference = (a: Float32Array, b: Float32Array) =>
  a.reduce((sum, value, k) => sum + Math.abs(value - b[k]!), 0) / a.length

function digitOf(glyph: Glyph, templates: readonly Template[]) {
  const ranked = templates
    .map(({ digit, grid }) => ({ digit, difference: difference(grid, glyph.grid) }))
    .sort((a, b) => a.difference - b.difference)
  const [best, second] = ranked
  if (!best || best.difference > MAX_DIFFERENCE_SHARE) return null
  if (second && second.difference - best.difference < MIN_MARGIN_SHARE) return null
  return best.digit
}

interface TableRow {
  readonly number: readonly Glyph[]
  readonly code: readonly Glyph[]
}

// Glyphs in the number and code columns, grouped into rows by height on the page. Rows come from
// the glyphs, not the rules: a producer may draw the lower rows' rules separately.
function tableRows(page: PdfPageContent, table: DescriptionTable): TableRow[] {
  const { rowRules, columnRules } = table
  const rowHeights = rowRules.slice(1).map((rule, i) => rowRules[i]! - rule)
  const cell = [...rowHeights].sort((a, b) => a - b)[Math.floor(rowHeights.length / 2)] ?? 0
  const columnOf = (x: number) =>
    columnRules.findIndex(
      (left, i) => i + 1 < columnRules.length && x >= left && x < columnRules[i + 1]!,
    )

  const glyphs = page.paths.flatMap((path, index) => {
    if (index < table.firstPathIndex || !path.fill || path.stroke) return []
    const rings = path.subpaths.map(subpath => subpath.points)
    const box = boxOf(rings.flat())
    const [x, y] = [box.minX + box.width / 2, box.minY + box.height / 2]
    const column = columnOf(x)
    if (y > table.maxY || (column !== NUMBER_COLUMN && column !== CODE_COLUMN)) return []
    if (box.height < cell * MIN_GLYPH_HEIGHT_SHARE || box.height > cell * MAX_GLYPH_HEIGHT_SHARE) {
      return []
    }
    return [{ column, y, glyph: { box, grid: gridOf(rings, box) } }]
  })

  const rows: { y: number; number: Glyph[]; code: Glyph[] }[] = []
  for (const { column, y, glyph } of glyphs.sort((a, b) => b.y - a.y)) {
    let row = rows[rows.length - 1]
    if (!row || row.y - y > cell * SAME_ROW_SHARE) {
      row = { y, number: [], code: [] }
      rows.push(row)
    }
    ;(column === NUMBER_COLUMN ? row.number : row.code).push(glyph)
  }
  return rows.map(({ number, code }) => ({
    number: number.sort((a, b) => a.box.minX - b.box.minX),
    code: code.sort((a, b) => a.box.minX - b.box.minX),
  }))
}

// The glyph's filled share of each cell of a small grid, scaled to the glyph's height so that
// narrow digits (1) stay narrow.
function gridOf(rings: readonly (readonly PaperPoint[])[], box: Box): Float32Array {
  const grid = new Float32Array(GRID.columns * GRID.rows)
  const cell = box.height / GRID.rows
  const left = box.minX + box.width / 2 - (GRID.columns * cell) / 2
  const samples = 3
  for (let row = 0; row < GRID.rows; row++) {
    for (let column = 0; column < GRID.columns; column++) {
      let inside = 0
      for (let i = 0; i < samples; i++) {
        for (let j = 0; j < samples; j++) {
          const x = left + (column + (i + 0.5) / samples) * cell
          const y = box.minY + box.height - (row + (j + 0.5) / samples) * cell
          if (isInside(rings, x, y)) inside++
        }
      }
      grid[row * GRID.columns + column] = inside / samples ** 2
    }
  }
  return grid
}

function isInside(rings: readonly (readonly PaperPoint[])[], x: number, y: number): boolean {
  let crossings = 0
  for (const ring of rings) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]!
      if (a[1] <= y === b[1] <= y) return
      if (a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]) > x) crossings++
    })
  }
  return crossings % 2 === 1
}
