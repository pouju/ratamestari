import { extentHeight, extentWidth, type LocalExtent } from '@ratamestari/core'

const SAFARI_MAX_CANVAS_PIXELS = 16_000_000
const MAX_CANVAS_SIDE = 8192
const MIN_METERS_PER_PIXEL = 0.5

export interface MapImage {
  readonly url: string
  readonly width: number
  readonly height: number
}

export async function rasterizeSvg(svg: SVGSVGElement, extent: LocalExtent): Promise<MapImage> {
  const widthMeters = extentWidth(extent)
  const heightMeters = extentHeight(extent)
  const metersPerPixel = Math.max(
    MIN_METERS_PER_PIXEL,
    Math.sqrt((widthMeters * heightMeters) / SAFARI_MAX_CANVAS_PIXELS),
    Math.max(widthMeters, heightMeters) / MAX_CANVAS_SIDE,
  )
  const width = Math.round(widthMeters / metersPerPixel)
  const height = Math.round(heightMeters / metersPerPixel)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('preserveAspectRatio', 'none')

  const svgUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }),
  )
  try {
    const img = new Image()
    img.src = svgUrl
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
    return { url: URL.createObjectURL(png), width, height }
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
