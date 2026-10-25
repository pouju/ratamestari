import { PDFDict, PDFDocument, PDFName, StandardFonts, type PDFFont, type PDFRef } from 'pdf-lib'
import { DOMParser } from 'xmldom'

// Draws the SVG subset our map renderer and print page use as vector PDF operators, so PDF map
// import can be tested on files whose true features and course are known.

type Matrix = readonly [number, number, number, number, number, number]

interface Style {
  readonly fill: string | null
  readonly stroke: string | null
  readonly strokeWidth: number
  readonly dash: readonly number[]
  readonly lineCap: string
  readonly lineJoin: string
  readonly fontSize: number
  readonly textAnchor: string
  readonly baseline: string
  readonly evenOdd: boolean
  readonly color: string
}

const POINTS_PER_MM = 72 / 25.4
const FONT_NAME = 'F1'
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const CENTRAL_BASELINE_SHIFT = 0.35
const DEFAULT_STYLE: Style = {
  fill: 'black',
  stroke: null,
  strokeWidth: 1,
  dash: [],
  lineCap: 'butt',
  lineJoin: 'miter',
  fontSize: 16,
  textAnchor: 'start',
  baseline: 'auto',
  evenOdd: false,
  color: 'black',
}
const LINE_CAPS: Record<string, number> = { butt: 0, round: 1, square: 2 }
const LINE_JOINS: Record<string, number> = { miter: 0, round: 1, bevel: 2 }

export async function svgToPdf(svg: string): Promise<Uint8Array> {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  const widthMm = parseFloat(root.getAttribute('width') ?? '0')
  const heightMm = parseFloat(root.getAttribute('height') ?? '0')
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([widthMm * POINTS_PER_MM, heightMm * POINTS_PER_MM])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const patterns = new Map<string, Element>()
  for (const pattern of elements(root.getElementsByTagName('pattern'))) {
    const id = pattern.getAttribute('id')
    if (id) patterns.set(id, pattern)
  }
  const patternResources = pdf.context.obj({})
  const writer = new ContentWriter(pdf, font, patterns, patternResources)
  const [, , viewWidth = widthMm, viewHeight = heightMm] = viewBoxOf(root) ?? []
  const pageMatrix: Matrix = [
    (widthMm / viewWidth) * POINTS_PER_MM,
    0,
    0,
    (-heightMm / viewHeight) * POINTS_PER_MM,
    0,
    heightMm * POINTS_PER_MM,
  ]
  writer.children(root, pageMatrix, styleOf(root, DEFAULT_STYLE))

  page.node.setFontDictionary(PDFName.of(FONT_NAME), font.ref)
  page.node.Resources()!.set(PDFName.of('Pattern'), patternResources)
  page.node.set(
    PDFName.of('Contents'),
    pdf.context.register(pdf.context.flateStream(writer.content())),
  )
  return pdf.save()
}

class ContentWriter {
  private readonly operators: string[] = []
  private patternCount = 0

  constructor(
    private readonly pdf: PDFDocument,
    private readonly font: PDFFont,
    private readonly patterns: Map<string, Element>,
    private readonly patternResources: PDFDict,
  ) {}

  content(): string {
    return this.operators.join('\n')
  }

  children(parent: Element, matrix: Matrix, style: Style) {
    for (const child of elements(parent.childNodes)) this.element(child, matrix, style)
  }

  private element(node: Element, parentMatrix: Matrix, parentStyle: Style) {
    const tag = node.tagName
    if (tag === 'defs' || tag === 'pattern') return
    const style = styleOf(node, parentStyle)
    const matrix = multiply(transformOf(node.getAttribute('transform')), parentMatrix)
    const number = (name: string) => numberAttribute(node, name)
    switch (tag) {
      case 'svg':
        return this.nestedSvg(node, matrix, style)
      case 'g':
        return this.children(node, matrix, style)
      case 'path':
        return this.paint(pathOperators(node.getAttribute('d') ?? ''), matrix, style)
      case 'rect':
        return this.paint(
          `${number('x')} ${number('y')} ${number('width')} ${number('height')} re`,
          matrix,
          style,
        )
      case 'circle':
        return this.paint(
          ellipseOperators(number('cx'), number('cy'), number('r'), number('r')),
          matrix,
          style,
        )
      case 'ellipse':
        return this.paint(
          ellipseOperators(number('cx'), number('cy'), number('rx'), number('ry')),
          matrix,
          style,
        )
      case 'line':
        return this.paint(
          `${number('x1')} ${number('y1')} m ${number('x2')} ${number('y2')} l`,
          matrix,
          { ...style, fill: null },
        )
      case 'polygon':
      case 'polyline': {
        const values = (node.getAttribute('points') ?? '')
          .trim()
          .split(/[\s,]+/)
          .map(Number)
        const points = values.flatMap((value, i) => (i % 2 === 0 ? [[value, values[i + 1]!]] : []))
        const operators = points.map(([x, y], i) => `${x} ${y} ${i === 0 ? 'm' : 'l'}`).join(' ')
        return this.paint(tag === 'polygon' ? `${operators} h` : operators, matrix, style)
      }
      case 'text':
        return this.text(node, matrix, style)
    }
  }

  private nestedSvg(node: Element, matrix: Matrix, style: Style) {
    const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(name =>
      numberAttribute(node, name),
    ) as [number, number, number, number]
    const [minX = 0, minY = 0, viewWidth = width, viewHeight = height] = viewBoxOf(node) ?? []
    const viewMatrix: Matrix = [
      width / viewWidth,
      0,
      0,
      height / viewHeight,
      x - (minX * width) / viewWidth,
      y - (minY * height) / viewHeight,
    ]
    const corners = [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ].map(([cornerX, cornerY]) => apply(matrix, cornerX!, cornerY!))
    const clip = corners.map(
      ([cornerX, cornerY], i) => `${round(cornerX)} ${round(cornerY)} ${i === 0 ? 'm' : 'l'}`,
    )
    this.operators.push('q', `${clip.join(' ')} h W n`)
    this.children(node, multiply(viewMatrix, matrix), style)
    this.operators.push('Q')
  }

  private paint(path: string, matrix: Matrix, style: Style) {
    if (path === '') return
    const fill = this.paintOperands(style.fill, 'fill', matrix)
    const stroke = this.paintOperands(style.stroke, 'stroke', matrix)
    if (!fill && !stroke) return
    const star = style.evenOdd ? '*' : ''
    const paintOperator = fill && stroke ? `B${star}` : fill ? `f${star}` : 'S'
    this.operators.push(
      'q',
      `${matrixOperands(matrix)} cm`,
      ...(fill ? [fill] : []),
      ...(stroke
        ? [
            stroke,
            `${style.strokeWidth} w`,
            `[${style.dash.join(' ')}] 0 d`,
            `${LINE_CAPS[style.lineCap] ?? 0} J`,
            `${LINE_JOINS[style.lineJoin] ?? 0} j`,
          ]
        : []),
      path,
      paintOperator,
      'Q',
    )
  }

  private paintOperands(
    paint: string | null,
    use: 'fill' | 'stroke',
    matrix: Matrix,
  ): string | null {
    if (!paint) return null
    const patternId = /^url\(#([^)]+)\)$/.exec(paint)?.[1]
    if (patternId) {
      const name = this.patternFor(patternId, matrix)
      if (!name) return null
      return use === 'fill' ? `/Pattern cs /${name} scn` : `/Pattern CS /${name} SCN`
    }
    const rgb = rgbOf(paint)
    if (!rgb) return null
    return `${rgb.join(' ')} ${use === 'fill' ? 'rg' : 'RG'}`
  }

  private patternFor(id: string, matrix: Matrix): string | null {
    const pattern = this.patterns.get(id)
    if (!pattern) return null
    const width = numberAttribute(pattern, 'width')
    const height = numberAttribute(pattern, 'height')
    if (!(width > 0) || !(height > 0)) return null
    const tile = new ContentWriter(this.pdf, this.font, this.patterns, this.patternResources)
    tile.children(pattern, IDENTITY, styleOf(pattern, DEFAULT_STYLE))
    const patternMatrix = multiply(transformOf(pattern.getAttribute('patternTransform')), matrix)
    const stream = this.pdf.context.flateStream(tile.content(), {
      Type: 'Pattern',
      PatternType: 1,
      PaintType: 1,
      TilingType: 1,
      BBox: [0, 0, width, height],
      XStep: width,
      YStep: height,
      Matrix: [...patternMatrix],
      Resources: {},
    })
    const name = `P${++this.patternCount}`
    this.patternResources.set(PDFName.of(name), this.pdf.context.register(stream) as PDFRef)
    return name
  }

  private text(node: Element, matrix: Matrix, style: Style) {
    const spans = elements(node.childNodes).filter(child => child.tagName === 'tspan')
    const runs =
      spans.length > 0
        ? spans.map(span => ({ node: span, style: styleOf(span, style) }))
        : [{ node, style }]
    for (const run of runs) {
      const content = (run.node.textContent ?? '').trim()
      const rgb = rgbOf(run.style.fill ?? '')
      if (content === '' || !rgb) continue
      const size = run.style.fontSize
      const width = this.font.widthOfTextAtSize(content, size)
      const anchorShift =
        run.style.textAnchor === 'middle' ? width / 2 : run.style.textAnchor === 'end' ? width : 0
      const baselineShift = run.style.baseline === 'central' ? size * CENTRAL_BASELINE_SHIFT : 0
      const positionOf = (name: string) =>
        run.node.getAttribute(name) ? numberAttribute(run.node, name) : numberAttribute(node, name)
      const x = positionOf('x') - anchorShift
      const y = positionOf('y') + baselineShift
      this.operators.push(
        'q',
        `${matrixOperands(matrix)} cm`,
        `${rgb.join(' ')} rg`,
        'BT',
        `/${FONT_NAME} ${size} Tf`,
        `1 0 0 -1 ${x} ${y} Tm`,
        `${this.font.encodeText(content).toString()} Tj`,
        'ET',
        'Q',
      )
    }
  }
}

function styleOf(node: Element, parent: Style): Style {
  const declared = new Map<string, string>()
  for (const name of [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'stroke-linecap',
    'stroke-linejoin',
    'font-size',
    'text-anchor',
    'dominant-baseline',
    'fill-rule',
    'color',
  ]) {
    const value = node.getAttribute(name)
    if (value) declared.set(name, value)
  }
  for (const declaration of (node.getAttribute('style') ?? '').split(';')) {
    const [name, value] = declaration.split(':').map(part => part.trim())
    if (name && value) declared.set(name, value)
  }
  const color = declared.get('color') ?? parent.color
  const paint = (value: string | undefined, inherited: string | null) => {
    if (value === undefined) return inherited
    if (value === 'none' || value === 'transparent') return null
    return value === 'currentColor' ? color : value
  }
  const number = (name: string, inherited: number) => {
    const value = parseFloat(declared.get(name) ?? '')
    return Number.isFinite(value) ? value : inherited
  }
  const dash = declared.get('stroke-dasharray')
  return {
    fill: paint(declared.get('fill'), parent.fill),
    stroke: paint(declared.get('stroke'), parent.stroke),
    strokeWidth: number('stroke-width', parent.strokeWidth),
    dash:
      dash === undefined ? parent.dash : dash === 'none' ? [] : dash.split(/[\s,]+/).map(Number),
    lineCap: declared.get('stroke-linecap') ?? parent.lineCap,
    lineJoin: declared.get('stroke-linejoin') ?? parent.lineJoin,
    fontSize: number('font-size', parent.fontSize),
    textAnchor: declared.get('text-anchor') ?? parent.textAnchor,
    baseline: declared.get('dominant-baseline') ?? parent.baseline,
    evenOdd: (declared.get('fill-rule') ?? (parent.evenOdd ? 'evenodd' : 'nonzero')) === 'evenodd',
    color,
  }
}

const NAMED_COLORS: Record<string, readonly [number, number, number]> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
}

function rgbOf(color: string): readonly [number, number, number] | null {
  const named = NAMED_COLORS[color]
  if (named) return named
  const functional = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(color)
  if (functional) return [1, 2, 3].map(i => round(Number(functional[i]) / 255)) as never
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (hex) return [0, 2, 4].map(i => round(parseInt(hex.slice(i, i + 2), 16) / 255)) as never
  return null
}

function transformOf(transform: string | null): Matrix {
  let matrix = IDENTITY
  for (const [, name, operands] of (transform ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const values = operands!
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    matrix = multiply(transformFunction(name!, values), matrix)
  }
  return matrix
}

function transformFunction(name: string, values: readonly number[]): Matrix {
  const [first = 0, second, third] = values
  switch (name) {
    case 'translate':
      return [1, 0, 0, 1, first, second ?? 0]
    case 'scale':
      return [first, 0, 0, second ?? first, 0, 0]
    case 'rotate': {
      const radians = (first * Math.PI) / 180
      const [cos, sin] = [Math.cos(radians), Math.sin(radians)]
      const [cx, cy] = [second ?? 0, third ?? 0]
      return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy]
    }
    case 'matrix':
      return values as unknown as Matrix
    default:
      throw new Error(`Unsupported SVG transform ${name}`)
  }
}

function pathOperators(d: string): string {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
  const operators: string[] = []
  let index = 0
  let command = ''
  let [x, y, startX, startY] = [0, 0, 0, 0]
  const next = () => Number(tokens[index++])
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index]!)) command = tokens[index++]!
    if (command !== command.toUpperCase() && command !== 'z') {
      throw new Error(`Relative SVG path command ${command} is not supported`)
    }
    switch (command) {
      case 'M':
        ;[x, y] = [next(), next()]
        ;[startX, startY] = [x, y]
        operators.push(`${x} ${y} m`)
        command = 'L'
        break
      case 'L':
        ;[x, y] = [next(), next()]
        operators.push(`${x} ${y} l`)
        break
      case 'H':
        x = next()
        operators.push(`${x} ${y} l`)
        break
      case 'V':
        y = next()
        operators.push(`${x} ${y} l`)
        break
      case 'C': {
        const values = [next(), next(), next(), next(), next(), next()]
        operators.push(`${values.join(' ')} c`)
        ;[x, y] = [values[4]!, values[5]!]
        break
      }
      case 'Q': {
        const [qx, qy, endX, endY] = [next(), next(), next(), next()]
        const control1 = [x + ((qx - x) * 2) / 3, y + ((qy - y) * 2) / 3]
        const control2 = [endX + ((qx - endX) * 2) / 3, endY + ((qy - endY) * 2) / 3]
        operators.push(`${control1.join(' ')} ${control2.join(' ')} ${endX} ${endY} c`)
        ;[x, y] = [endX, endY]
        break
      }
      case 'A': {
        const [rx, ry, rotation, largeArc, sweep, endX, endY] = [
          next(),
          next(),
          next(),
          next(),
          next(),
          next(),
          next(),
        ]
        operators.push(
          ...arcOperators(x, y, rx, ry, rotation, largeArc !== 0, sweep !== 0, endX, endY),
        )
        ;[x, y] = [endX, endY]
        break
      }
      case 'Z':
      case 'z':
        operators.push('h')
        ;[x, y] = [startX, startY]
        break
      default:
        throw new Error(`Unsupported SVG path command ${command}`)
    }
  }
  return operators.join(' ')
}

// SVG arc to cubic Béziers, following the SVG implementation notes (endpoint to centre form).
function arcOperators(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): string[] {
  if (rx === 0 || ry === 0) return [`${x2} ${y2} l`]
  const phi = (rotationDegrees * Math.PI) / 180
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)]
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const radiiScale = Math.max(1, Math.sqrt((x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)))
  rx *= radiiScale
  ry *= radiiScale
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (factor * rx * y1p) / ry
  const cyp = (-factor * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
  const step = delta / segments
  const handle = (4 / 3) * Math.tan(step / 4)
  const pointAt = (theta: number, scale = 1, along = 0) => {
    const ex = rx * (Math.cos(theta) - along * Math.sin(theta)) * scale
    const ey = ry * (Math.sin(theta) + along * Math.cos(theta)) * scale
    return `${cx + cos * ex - sin * ey} ${cy + sin * ex + cos * ey}`
  }
  return Array.from({ length: segments }, (_, i) => {
    const from = start + i * step
    const to = from + step
    return `${pointAt(from, 1, handle)} ${pointAt(to, 1, -handle)} ${pointAt(to)} c`
  })
}

const ELLIPSE_HANDLE = 0.5523

function ellipseOperators(cx: number, cy: number, rx: number, ry: number): string {
  if (!(rx > 0) || !(ry > 0)) return ''
  const [hx, hy] = [rx * ELLIPSE_HANDLE, ry * ELLIPSE_HANDLE]
  return [
    `${cx + rx} ${cy} m`,
    `${cx + rx} ${cy + hy} ${cx + hx} ${cy + ry} ${cx} ${cy + ry} c`,
    `${cx - hx} ${cy + ry} ${cx - rx} ${cy + hy} ${cx - rx} ${cy} c`,
    `${cx - rx} ${cy - hy} ${cx - hx} ${cy - ry} ${cx} ${cy - ry} c`,
    `${cx + hx} ${cy - ry} ${cx + rx} ${cy - hy} ${cx + rx} ${cy} c`,
    'h',
  ].join(' ')
}

function numberAttribute(node: Element, name: string): number {
  const value = parseFloat(node.getAttribute(name) ?? '')
  return Number.isFinite(value) ? value : 0
}

function viewBoxOf(node: Element): number[] | null {
  const viewBox = node.getAttribute('viewBox')
  return viewBox
    ? viewBox
        .trim()
        .split(/[\s,]+/)
        .map(Number)
    : null
}

function elements(nodes: NodeListOf<ChildNode> | HTMLCollectionOf<Element>): Element[] {
  return Array.from(nodes as ArrayLike<Node>).filter((node): node is Element => node.nodeType === 1)
}

const apply = ([a, b, c, d, e, f]: Matrix, x: number, y: number): readonly [number, number] => [
  a * x + c * y + e,
  b * x + d * y + f,
]

const matrixOperands = (matrix: Matrix) => matrix.map(round).join(' ')

const round = (value: number) => Math.round(value * 10000) / 10000

const multiply = ([a1, b1, c1, d1, e1, f1]: Matrix, [a2, b2, c2, d2, e2, f2]: Matrix): Matrix => [
  a1 * a2 + b1 * c2,
  a1 * b2 + b1 * d2,
  c1 * a2 + d1 * c2,
  c1 * b2 + d1 * d2,
  e1 * a2 + f1 * c2 + e2,
  e1 * b2 + f1 * d2 + f2,
]
