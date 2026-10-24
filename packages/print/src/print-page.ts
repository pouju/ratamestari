import { localPoint, type LocalExtent, type LocalPoint } from '@ratamestari/core'
import {
  peripheralLayout,
  placeDescriptionBox,
  type Course,
  type PeripheralBlock,
  type PrintArea,
} from '@ratamestari/engine'
import { renderDescriptionSheet, type DescriptionSheet } from '@ratamestari/iof'
import {
  COURSE_OVERPRINT,
  PAPER,
  PERIPHERAL_INFORMATION,
  overprintMillimetresAt,
} from '@ratamestari/rules'

export interface PrintPageInput {
  readonly mapSvg: string
  readonly mapScale: number
  readonly course: Course
  readonly sheet: DescriptionSheet
  readonly peripheral?: PrintPeripheral
  // Only the map and its peripheral information, for a background the course is drawn over.
  readonly withoutCourse?: boolean
}

export interface PrintPeripheral {
  readonly blocks: readonly { readonly block: PeripheralBlock; readonly svg: string }[]
  // Already in the reader's language, e.g. "1:15 000 · contour interval 5 m".
  readonly scaleLine: string
}

export interface PrintPage {
  readonly svg: string
  readonly widthMillimetres: number
  readonly heightMillimetres: number
}

const MAP_SVG_UNITS_PER_METRE_AT_SCALE_1 = 100 * 1000
const MILLIMETRES_PER_METRE = 1000
const ROOT_SVG_TAG = /<svg\b[^>]*>/
const SIZE_ATTRIBUTES = /\s(?:width|height|viewBox|x|y|preserveAspectRatio)="[^"]*"/g

const SCALE_LINE_FONT_SHARE = 0.65

const round = (value: number) => Math.round(value * 1000) / 1000

export function printPageSvg({
  mapSvg,
  mapScale,
  course,
  sheet,
  peripheral,
  withoutCourse = false,
}: PrintPageInput): PrintPage | null {
  const area = course.printArea
  if (!area) return null
  const [shortSide, longSide] = PAPER.sizesMillimetres[area.paper]
  const pageWidth = area.orientation === 'portrait' ? shortSide : longSide
  const pageHeight = area.orientation === 'portrait' ? longSide : shortSide
  const margin = PAPER.printMarginMillimetres
  const [minX, minY, maxX, maxY] = area.extent
  const toPage = ([x, y]: LocalPoint): [number, number] => [
    margin + ((x - minX) * MILLIMETRES_PER_METRE) / area.scale,
    margin + ((maxY - y) * MILLIMETRES_PER_METRE) / area.scale,
  ]

  const map = mapWindow(mapSvg, mapScale, area.extent, [
    margin,
    margin,
    ((maxX - minX) * MILLIMETRES_PER_METRE) / area.scale,
    ((maxY - minY) * MILLIMETRES_PER_METRE) / area.scale,
  ])
  const overprint = withoutCourse ? '' : courseOverprint(course, area.scale, toPage)
  const descriptions = withoutCourse ? '' : descriptionBox(sheet, area, toPage)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}mm" height="${pageHeight}mm"` +
    ` viewBox="0 0 ${pageWidth} ${pageHeight}">` +
    `<rect width="${pageWidth}" height="${pageHeight}" fill="white"/>` +
    map +
    overprint +
    descriptions +
    (peripheral ? peripheralInformation(peripheral, mapScale, area, toPage) : '') +
    `</svg>`
  return { svg, widthMillimetres: pageWidth, heightMillimetres: pageHeight }
}

// Shows the given ground extent of the map SVG in a box on the page, in millimetres.
function mapWindow(
  mapSvg: string,
  mapScale: number,
  [minX, minY, maxX, maxY]: LocalExtent,
  [x, y, width, height]: readonly [number, number, number, number],
): string {
  const rootTag = ROOT_SVG_TAG.exec(mapSvg)?.[0]
  if (!rootTag) throw new Error('The map is not an SVG document')
  const viewBox =
    /viewBox="([^"]*)"/
      .exec(rootTag)?.[1]
      ?.split(/[\s,]+/)
      .map(Number) ?? []
  const [, viewMinY = 0, , viewHeight = 0] = viewBox
  // The map SVG flips OCAD paper y so that it grows downwards.
  const flipOffset = 2 * viewMinY + viewHeight
  const unitsPerMetre = MAP_SVG_UNITS_PER_METRE_AT_SCALE_1 / mapScale
  const placedTag =
    rootTag.replace(SIZE_ATTRIBUTES, '').replace(/\/?>$/, '') +
    ` x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}"` +
    ` viewBox="${round(minX * unitsPerMetre)} ${round(flipOffset - maxY * unitsPerMetre)}` +
    ` ${round((maxX - minX) * unitsPerMetre)} ${round((maxY - minY) * unitsPerMetre)}"` +
    ` preserveAspectRatio="none">`
  return mapSvg.replace(rootTag, placedTag).replace(/^<\?xml[^>]*>\s*/, '')
}

// Logo and copyright keep their size on the map's paper; the column hugs the page edge.
function peripheralInformation(
  { blocks, scaleLine }: PrintPeripheral,
  mapScale: number,
  area: PrintArea,
  toPage: (point: LocalPoint) => [number, number],
): string {
  if (!area.peripheralBox) return ''
  const [boxMinX, boxMinY, boxMaxX, boxMaxY] = area.peripheralBox
  const [left, top] = toPage(localPoint(boxMinX, boxMaxY))
  const [right] = toPage(localPoint(boxMaxX, boxMinY))
  const onRight = boxMinX - area.extent[0] > area.extent[2] - boxMaxX
  const layout = peripheralLayout(blocks.map(({ block }) => block))
  const [, bottom] = toPage(localPoint(boxMinX, boxMinY))
  const parts = [
    `<rect x="${round(left)}" y="${round(top)}" width="${round(right - left)}"` +
      ` height="${round(bottom - top)}" fill="white"/>`,
  ]
  blocks.forEach(({ block, svg }, i) => {
    const [offsetX, offsetY] = layout.blockOffsetsMillimetres[i]!
    const x = onRight ? right - offsetX - block.widthMillimetres : left + offsetX
    parts.push(
      mapWindow(svg, mapScale, block.extent, [
        x,
        top + offsetY,
        block.widthMillimetres,
        block.heightMillimetres,
      ]),
    )
  })
  const fontSize = PERIPHERAL_INFORMATION.scaleLineMillimetres * SCALE_LINE_FONT_SHARE
  const baseline =
    top + layout.scaleLineTopMillimetres + PERIPHERAL_INFORMATION.scaleLineMillimetres * 0.75
  parts.push(
    `<text x="${round(onRight ? right : left)}" y="${round(baseline)}"` +
      ` font-family="Arial, Helvetica, sans-serif" font-size="${round(fontSize)}"` +
      ` text-anchor="${onRight ? 'end' : 'start'}" fill="black">${escapeXml(scaleLine)}</text>`,
  )
  return `<g>${parts.join('')}</g>`
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function courseOverprint(
  course: Course,
  printScale: number,
  toPage: (point: LocalPoint) => [number, number],
): string {
  const mm = (millimetres: number) => overprintMillimetresAt(millimetres, printScale)
  const lineWidth = mm(COURSE_OVERPRINT.courseLineWidthMillimetres)
  const stroke = `fill="none" stroke="${COURSE_OVERPRINT.colour}" stroke-width="${round(lineWidth)}"`
  const parts: string[] = []
  const circle = ([cx, cy]: [number, number], diameter: number) =>
    parts.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(diameter / 2)}" ${stroke}/>`)

  const stops = [
    course.start.position,
    ...course.controls.map(site => site.position),
    course.finish,
  ]
  const pagePoints = stops.map(toPage)
  const controlDiameter = mm(COURSE_OVERPRINT.controlCircleDiameterMillimetres)
  const triangleRadius = mm(COURSE_OVERPRINT.startTriangleSideMillimetres) / Math.sqrt(3)
  const finishOuter = mm(COURSE_OVERPRINT.finishOuterDiameterMillimetres)
  const numberHeight = mm(COURSE_OVERPRINT.controlNumberHeightMillimetres)
  const gap = mm(COURSE_OVERPRINT.courseLineGapMillimetres)

  const [sx, sy] = pagePoints[0]!
  const [tx, ty] = pagePoints[1]!
  const heading = Math.atan2(ty - sy, tx - sx)
  const corners = [0, 120, 240].map(degrees => {
    const angle = heading + (degrees * Math.PI) / 180
    return `${round(sx + triangleRadius * Math.cos(angle))},${round(sy + triangleRadius * Math.sin(angle))}`
  })
  parts.push(`<polygon points="${corners.join(' ')}" ${stroke}/>`)

  pagePoints.slice(1, -1).forEach(([cx, cy], i) => {
    circle([cx, cy], controlDiameter)
    const offset = (controlDiameter / 2 + numberHeight / 2) * Math.SQRT1_2
    parts.push(
      `<text x="${round(cx + offset)}" y="${round(cy - offset)}" font-family="Arial, Helvetica, sans-serif"` +
        ` font-size="${round(numberHeight)}" text-anchor="middle" dominant-baseline="central"` +
        ` fill="${COURSE_OVERPRINT.colour}">${i + 1}</text>`,
    )
  })
  const finish = pagePoints[pagePoints.length - 1]!
  circle(finish, mm(COURSE_OVERPRINT.finishInnerDiameterMillimetres))
  circle(finish, finishOuter)

  const radii = [triangleRadius, ...course.controls.map(() => controlDiameter / 2), finishOuter / 2]
  for (let i = 1; i < pagePoints.length; i++) {
    const [ax, ay] = pagePoints[i - 1]!
    const [bx, by] = pagePoints[i]!
    const length = Math.hypot(bx - ax, by - ay)
    const trimStart = radii[i - 1]! + gap
    const trimEnd = radii[i]! + gap
    if (length <= trimStart + trimEnd) continue
    const ux = (bx - ax) / length
    const uy = (by - ay) / length
    parts.push(
      `<line x1="${round(ax + ux * trimStart)}" y1="${round(ay + uy * trimStart)}"` +
        ` x2="${round(bx - ux * trimEnd)}" y2="${round(by - uy * trimEnd)}" ${stroke}/>`,
    )
  }
  return `<g>${parts.join('')}</g>`
}

function descriptionBox(
  sheet: DescriptionSheet,
  area: PrintArea,
  toPage: (point: LocalPoint) => [number, number],
): string {
  const rendered = renderDescriptionSheet(sheet)
  const metresPerMillimetre = area.scale / MILLIMETRES_PER_METRE
  const [left, , , top] = placeDescriptionBox(
    area,
    rendered.widthMillimetres * metresPerMillimetre,
    rendered.heightMillimetres * metresPerMillimetre,
  )
  const [x, y] = toPage(localPoint(left, top))
  return rendered.svg.replace(
    /width="[\d.]+mm" height="[\d.]+mm"/,
    `x="${round(x)}" y="${round(y)}" width="${rendered.widthMillimetres}" height="${rendered.heightMillimetres}"`,
  )
}
