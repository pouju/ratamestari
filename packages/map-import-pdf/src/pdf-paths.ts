import { paperPoint, type PaperPoint } from '@ratamestari/core'
import {
  getDocument,
  GlobalWorkerOptions,
  OPS,
  VerbosityLevel,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'

export type PdfPaint =
  | { readonly kind: 'color'; readonly color: string }
  | {
      readonly kind: 'pattern'
      readonly tile: readonly PdfPath[]
      // The two vectors the tile repeats along, and where one tile starts, in paper units.
      readonly lattice: readonly [readonly [number, number], readonly [number, number]]
      readonly origin: readonly [number, number]
    }

export interface PdfSubpath {
  readonly points: readonly PaperPoint[]
  readonly closed: boolean
  readonly curved: boolean
}

export interface PdfClip {
  readonly subpaths: readonly PdfSubpath[]
  readonly evenOdd: boolean
}

export interface PdfPath {
  readonly subpaths: readonly PdfSubpath[]
  readonly fill: PdfPaint | null
  readonly evenOdd: boolean
  readonly stroke: PdfPaint | null
  readonly lineWidth: number
  readonly dash: readonly number[]
  // The path is only visible inside all of these.
  readonly clips: readonly PdfClip[]
}

export interface PdfText {
  readonly text: string
  readonly origin: PaperPoint
  readonly height: number
  readonly angleRadians: number
}

export interface PdfPageContent {
  readonly width: number
  readonly height: number
  readonly paths: readonly PdfPath[]
  readonly texts: readonly PdfText[]
}

type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number]

interface OperatorList {
  readonly fnArray: readonly number[]
  readonly argsArray: readonly unknown[]
}

interface GraphicsState {
  matrix: Matrix
  fill: PdfPaint | null
  stroke: PdfPaint | null
  lineWidth: number
  dash: readonly number[]
  clips: readonly PdfClip[]
}

const HUNDREDTHS_MM_PER_PDF_POINT = (25.4 / 72) * 100
const POINT_TO_PAPER: Matrix = [
  HUNDREDTHS_MM_PER_PDF_POINT,
  0,
  0,
  HUNDREDTHS_MM_PER_PDF_POINT,
  0,
  0,
]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const CURVE_SEGMENT_PAPER = 20

const DRAW_MOVE_TO = 0
const DRAW_LINE_TO = 1
const DRAW_CURVE_TO = 2
const DRAW_QUADRATIC_CURVE_TO = 3
const DRAW_CLOSE_PATH = 4

const FILL_OPS = new Set([OPS.fill, OPS.eoFill])
const STROKE_OPS = new Set([OPS.stroke, OPS.closeStroke])
const FILL_STROKE_OPS = new Set([
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
])
const EVEN_ODD_OPS = new Set([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke])

// In a browser, pdf.js parses in its own worker, which the app bundles and points to here.
export function setPdfWorkerUrl(url: string) {
  GlobalWorkerOptions.workerSrc = url
}

export async function readPdfPages(bytes: Uint8Array): Promise<PdfPageContent[]> {
  const loading = getDocument({
    // pdf.js hands the data to its worker, which leaves the caller's array empty.
    data: bytes.slice(),
    verbosity: VerbosityLevel.ERRORS,
  })
  const document = await loading.promise
  try {
    const pages: PdfPageContent[] = []
    for (let number = 1; number <= document.numPages; number++) {
      pages.push(await readPage(await document.getPage(number)))
    }
    return pages
  } finally {
    await loading.destroy()
  }
}

async function readPage(page: PDFPageProxy): Promise<PdfPageContent> {
  const [minX = 0, minY = 0, maxX = 0, maxY = 0] = page.view
  const pageToPaper = multiply([1, 0, 0, 1, -minX, -minY], POINT_TO_PAPER)
  const operatorList = await page.getOperatorList()
  const textContent = await page.getTextContent()
  const texts = textContent.items.flatMap((item): PdfText[] => {
    if (!('str' in item) || item.str.trim() === '') return []
    const [a, b, c, d, e, f] = multiply(item.transform as unknown as Matrix, pageToPaper)
    return [
      {
        text: item.str,
        origin: paperPoint(e, f),
        height: Math.hypot(c, d),
        angleRadians: Math.atan2(b, a),
      },
    ]
  })
  return {
    width: (maxX - minX) * HUNDREDTHS_MM_PER_PDF_POINT,
    height: (maxY - minY) * HUNDREDTHS_MM_PER_PDF_POINT,
    paths: readPaths(operatorList, pageToPaper),
    texts,
  }
}

function readPaths(operatorList: OperatorList, baseMatrix: Matrix): PdfPath[] {
  const paths: PdfPath[] = []
  const stack: GraphicsState[] = []
  let state: GraphicsState = {
    matrix: baseMatrix,
    fill: { kind: 'color', color: '#000000' },
    stroke: { kind: 'color', color: '#000000' },
    lineWidth: 1,
    dash: [],
    clips: [],
  }
  let pendingClip: { evenOdd: boolean } | null = null
  const save = () => stack.push({ ...state })
  const restore = () => {
    state = stack.pop() ?? state
  }

  operatorList.fnArray.forEach((fn, index) => {
    const args = operatorList.argsArray[index] as unknown[]
    switch (fn) {
      case OPS.save:
        return save()
      case OPS.restore:
        return restore()
      case OPS.transform:
        state.matrix = multiply(args as unknown as Matrix, state.matrix)
        return
      case OPS.paintFormXObjectBegin:
        save()
        if (args[0]) state.matrix = multiply(args[0] as Matrix, state.matrix)
        return
      case OPS.paintFormXObjectEnd:
        return restore()
      case OPS.setLineWidth:
        state.lineWidth = args[0] as number
        return
      case OPS.setDash:
        state.dash = args[0] as number[]
        return
      case OPS.setGState:
        for (const [key, value] of args[0] as [string, unknown][]) {
          if (key === 'LW') state.lineWidth = value as number
          if (key === 'D') state.dash = (value as [number[], number])[0]
        }
        return
      case OPS.setFillRGBColor:
        state.fill = { kind: 'color', color: args[0] as string }
        return
      case OPS.setStrokeRGBColor:
        state.stroke = { kind: 'color', color: args[0] as string }
        return
      case OPS.setFillTransparent:
        state.fill = null
        return
      case OPS.setStrokeTransparent:
        state.stroke = null
        return
      case OPS.setFillColorN:
        state.fill = patternPaint(args)
        return
      case OPS.setStrokeColorN:
        state.stroke = patternPaint(args)
        return
      case OPS.clip:
      case OPS.eoClip:
        pendingClip = { evenOdd: fn === OPS.eoClip }
        return
      case OPS.constructPath: {
        if (pendingClip) {
          const [, [data]] = args as [number, [ArrayLike<number> | null]]
          if (data) {
            const clip = { subpaths: flattenPath(data, state.matrix), evenOdd: pendingClip.evenOdd }
            state.clips = [...state.clips, clip]
          }
          pendingClip = null
        }
        const path = paintedPath(args, state)
        if (path) paths.push(path)
        return
      }
    }
  })
  return paths
}

function patternPaint(args: unknown[]): PdfPaint | null {
  const [kind, , operatorList, matrix, , xStep, yStep] = args as [
    string,
    unknown,
    OperatorList,
    Matrix | undefined,
    unknown,
    number,
    number,
  ]
  if (kind !== 'TilingPattern') return null
  const tileToPaper = multiply(matrix ?? IDENTITY, POINT_TO_PAPER)
  const [a, b, c, d, e, f] = tileToPaper
  return {
    kind: 'pattern',
    tile: readPaths(operatorList, tileToPaper),
    lattice: [
      [a * xStep, b * xStep],
      [c * yStep, d * yStep],
    ],
    origin: [e, f],
  }
}

function paintedPath(args: unknown[], state: GraphicsState): PdfPath | null {
  const [paintOp, [data]] = args as [number, [ArrayLike<number> | null]]
  const fills = FILL_OPS.has(paintOp) || FILL_STROKE_OPS.has(paintOp)
  const strokes = STROKE_OPS.has(paintOp) || FILL_STROKE_OPS.has(paintOp)
  if (!data || (!fills && !strokes)) return null
  const subpaths = flattenPath(data, state.matrix)
  if (subpaths.length === 0) return null
  const scale = Math.sqrt(
    Math.abs(state.matrix[0] * state.matrix[3] - state.matrix[1] * state.matrix[2]),
  )
  return {
    subpaths,
    fill: fills ? state.fill : null,
    evenOdd: EVEN_ODD_OPS.has(paintOp),
    stroke: strokes ? state.stroke : null,
    lineWidth: state.lineWidth * scale,
    dash: state.dash.map(length => length * scale),
    clips: state.clips,
  }
}

function flattenPath(data: ArrayLike<number>, matrix: Matrix): PdfSubpath[] {
  const subpaths: PdfSubpath[] = []
  let points: PaperPoint[] = []
  let curved = false
  let closed = false
  const finish = () => {
    if (points.length > 1) subpaths.push({ points, closed, curved })
    points = []
    curved = false
    closed = false
  }
  const at = (x: number, y: number) => apply(matrix, x, y)
  const last = () => points[points.length - 1] ?? paperPoint(0, 0)
  const addCurve = (controls: readonly PaperPoint[]) => {
    const start = last()
    const span = controls.reduce(
      (sum, point, i) =>
        sum +
        Math.hypot(
          point[0] - (controls[i - 1] ?? start)[0],
          point[1] - (controls[i - 1] ?? start)[1],
        ),
      0,
    )
    const steps = Math.max(2, Math.ceil(span / CURVE_SEGMENT_PAPER))
    for (let step = 1; step <= steps; step++)
      points.push(bezierPoint([start, ...controls], step / steps))
    curved = true
  }

  for (let i = 0; i < data.length;) {
    switch (data[i++]) {
      case DRAW_MOVE_TO:
        finish()
        points.push(at(data[i++]!, data[i++]!))
        break
      case DRAW_LINE_TO:
        points.push(at(data[i++]!, data[i++]!))
        break
      case DRAW_CURVE_TO:
        addCurve([
          at(data[i++]!, data[i++]!),
          at(data[i++]!, data[i++]!),
          at(data[i++]!, data[i++]!),
        ])
        break
      case DRAW_QUADRATIC_CURVE_TO:
        addCurve([at(data[i++]!, data[i++]!), at(data[i++]!, data[i++]!)])
        break
      case DRAW_CLOSE_PATH:
        closed = true
        finish()
        break
      default:
        throw new Error(`Unknown PDF path operation at ${i - 1}`)
    }
  }
  finish()
  return subpaths
}

function bezierPoint(controls: readonly PaperPoint[], t: number): PaperPoint {
  let level: readonly PaperPoint[] = controls
  while (level.length > 1) {
    level = level.slice(1).map((point, i) => {
      const previous = level[i]!
      return paperPoint(
        previous[0] + (point[0] - previous[0]) * t,
        previous[1] + (point[1] - previous[1]) * t,
      )
    })
  }
  return level[0]!
}

const apply = ([a, b, c, d, e, f]: Matrix, x: number, y: number): PaperPoint =>
  paperPoint(a * x + c * y + e, b * x + d * y + f)

const multiply = ([a1, b1, c1, d1, e1, f1]: Matrix, [a2, b2, c2, d2, e2, f2]: Matrix): Matrix => [
  a1 * a2 + b1 * c2,
  a1 * b2 + b1 * d2,
  c1 * a2 + d1 * c2,
  c1 * b2 + d1 * d2,
  e1 * a2 + f1 * c2 + e2,
  e1 * b2 + f1 * d2 + f2,
]
