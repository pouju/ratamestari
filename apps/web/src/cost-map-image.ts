import type { GridFrame } from '@ratamestari/engine'
import { RUNNABILITY } from '@ratamestari/rules'

export interface CostGridSnapshot {
  readonly frame: GridFrame
  readonly speed: Float32Array
}

export interface CostMapImage {
  readonly url: string
  readonly extent: readonly [minX: number, minY: number, maxX: number, maxY: number]
}

type Rgba = readonly [red: number, green: number, blue: number, alpha: number]

const BLOCKED_RED: Rgba = [220, 0, 0, 190]
const FAST_BLUE: Rgba = [0, 110, 255, 140]
const SLOW_ORANGE_RGB = [255, 120, 0] as const
const MAX_SLOW_ALPHA = 200

const fastFromSpeed = RUNNABILITY[1].minSpeedFraction
const slowFromSpeed = RUNNABILITY[2].minSpeedFraction

const colourForSpeed = (speed: number): Rgba | null => {
  if (speed === 0) return BLOCKED_RED
  if (speed >= fastFromSpeed) return FAST_BLUE
  if (speed >= slowFromSpeed) return null
  const slowness = 1 - speed / slowFromSpeed
  return [...SLOW_ORANGE_RGB, Math.round(MAX_SLOW_ALPHA * slowness)]
}

export async function renderCostMap({ frame, speed }: CostGridSnapshot): Promise<CostMapImage> {
  const canvas = document.createElement('canvas')
  canvas.width = frame.columns
  canvas.height = frame.rows
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  const pixels = ctx.createImageData(frame.columns, frame.rows)

  for (let row = 0; row < frame.rows; row++) {
    const imageRow = frame.rows - 1 - row
    for (let column = 0; column < frame.columns; column++) {
      const colour = colourForSpeed(speed[row * frame.columns + column]!)
      if (!colour) continue
      pixels.data.set(colour, (imageRow * frame.columns + column) * 4)
    }
  }
  ctx.putImageData(pixels, 0, 0)

  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  )
  return {
    url: URL.createObjectURL(png),
    extent: [
      frame.minX,
      frame.minY,
      frame.minX + frame.columns * frame.cellSizeMeters,
      frame.minY + frame.rows * frame.cellSizeMeters,
    ],
  }
}
