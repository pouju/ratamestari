import type { PaperPoint } from '@ratamestari/core'
import type { PdfClip, PdfPageContent, PdfPaint, PdfPath, PdfSubpath } from './pdf-paths'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const LATTICE_NEIGHBOURS = [-1, 0, 1]

// Draws the page again from its paths, leaving out `hidden` ones (the course and its
// description box). Like the OCAD map's SVG, units are paper units and y is flipped, so the
// viewBox maps onto the page's extent in ground metres at any print scale.
export function renderPdfPageSvg(
  document: Document,
  page: PdfPageContent,
  hidden: ReadonlySet<number>,
): SVGSVGElement {
  const element = <K extends keyof SVGElementTagNameMap>(
    name: K,
    attributes: Record<string, string>,
  ) => {
    const node = document.createElementNS(SVG_NAMESPACE, name)
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
    return node
  }

  const svg = element('svg', { viewBox: `0 0 ${page.width} ${page.height}` })
  const definitions = element('defs', {})
  svg.appendChild(definitions)
  const flipped = element('g', { transform: `matrix(1 0 0 -1 0 ${page.height})` })
  svg.appendChild(flipped)

  const clipIds = new Map<PdfClip, string>()
  const clipIdOf = (clip: PdfClip) => {
    const known = clipIds.get(clip)
    if (known) return known
    const id = `clip${clipIds.size}`
    const clipPath = element('clipPath', { id, clipPathUnits: 'userSpaceOnUse' })
    clipPath.appendChild(
      element('path', {
        d: pathData(clip.subpaths),
        'clip-rule': clip.evenOdd ? 'evenodd' : 'nonzero',
      }),
    )
    definitions.appendChild(clipPath)
    clipIds.set(clip, id)
    return id
  }

  const patternIds = new Map<string, string>()
  const paintOf = (paint: PdfPaint | null): string => {
    if (!paint) return 'none'
    if (paint.kind === 'color') return paint.color
    const signature = JSON.stringify([
      paint.lattice,
      paint.origin,
      paint.tile.length,
      paint.tile[0]?.subpaths[0]?.points[0],
    ])
    const known = patternIds.get(signature)
    if (known) return `url(#${known})`
    const id = `pattern${patternIds.size}`
    const [[ax, ay], [bx, by]] = paint.lattice
    const [ox, oy] = paint.origin
    const determinant = ax * by - ay * bx
    const inverse = [by, -ay, -bx, ax].map(value => value / determinant) as [
      number,
      number,
      number,
      number,
    ]
    const pattern = element('pattern', {
      id,
      patternUnits: 'userSpaceOnUse',
      width: '1',
      height: '1',
      patternTransform: `matrix(${ax} ${ay} ${bx} ${by} ${ox} ${oy})`,
    })
    const toUnitTile = element('g', {
      transform: `matrix(${inverse.join(' ')} ${-(inverse[0] * ox + inverse[2] * oy)} ${-(inverse[1] * ox + inverse[3] * oy)})`,
    })
    // Tile content may reach into the neighbouring tiles, as PDF tiles may overlap.
    for (const i of LATTICE_NEIGHBOURS) {
      for (const j of LATTICE_NEIGHBOURS) {
        const shifted = element('g', {
          transform: `translate(${i * ax + j * bx} ${i * ay + j * by})`,
        })
        for (const tilePath of paint.tile) shifted.appendChild(drawnPath(tilePath))
        toUnitTile.appendChild(shifted)
      }
    }
    pattern.appendChild(toUnitTile)
    definitions.appendChild(pattern)
    patternIds.set(signature, id)
    return `url(#${id})`
  }

  const drawnPath = (path: PdfPath) =>
    element('path', {
      d: pathData(path.subpaths),
      fill: paintOf(path.fill),
      'fill-rule': path.evenOdd ? 'evenodd' : 'nonzero',
      stroke: paintOf(path.stroke),
      'stroke-width': String(path.lineWidth),
      ...(path.dash.length > 0 && { 'stroke-dasharray': path.dash.join(' ') }),
    })

  const simplified = new Map<readonly PdfClip[], readonly PdfClip[]>()
  let currentClips: readonly PdfClip[] | null = null
  let target: SVGElement = flipped
  page.paths.forEach((path, index) => {
    if (hidden.has(index)) return
    if (path.clips !== currentClips) {
      currentClips = path.clips
      target = flipped
      const clips = simplified.get(path.clips) ?? asOneRectangle(path.clips)
      simplified.set(path.clips, clips)
      for (const clip of clips) {
        const group = element('g', { 'clip-path': `url(#${clipIdOf(clip)})` })
        target.appendChild(group)
        target = group
      }
    }
    target.appendChild(drawnPath(path))
  })
  return svg
}

// Producers clip the map with nested rectangles (page, frame, map area); one rectangle does the
// same and keeps renderers away from deeply nested clipping, which some draw wrongly.
function asOneRectangle(clips: readonly PdfClip[]): readonly PdfClip[] {
  const boxes = clips.map(rectangleOf)
  if (boxes.length < 2 || boxes.some(box => box === null)) return clips
  const minX = Math.max(...boxes.map(box => box![0]))
  const minY = Math.max(...boxes.map(box => box![1]))
  const maxX = Math.min(...boxes.map(box => box![2]))
  const maxY = Math.min(...boxes.map(box => box![3]))
  const corner = (x: number, y: number) => [x, y] as unknown as PaperPoint
  return [
    {
      evenOdd: false,
      subpaths: [
        {
          points: [corner(minX, minY), corner(maxX, minY), corner(maxX, maxY), corner(minX, maxY)],
          closed: true,
          curved: false,
        },
      ],
    },
  ]
}

function rectangleOf(clip: PdfClip): readonly [number, number, number, number] | null {
  const [only, ...others] = clip.subpaths
  if (!only || others.length > 0 || only.curved) return null
  const xs = [...new Set(only.points.map(([x]) => Math.round(x)))]
  const ys = [...new Set(only.points.map(([, y]) => Math.round(y)))]
  if (xs.length !== 2 || ys.length !== 2) return null
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function pathData(subpaths: readonly PdfSubpath[]): string {
  return subpaths
    .map(({ points, closed }) => `M${points.map(pointData).join('L')}${closed ? 'Z' : ''}`)
    .join('')
}

const pointData = ([x, y]: PaperPoint) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`
