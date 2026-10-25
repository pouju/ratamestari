import type { PaperPoint } from '@ratamestari/core'
import type { PdfClip, PdfPath } from './pdf-paths'

export function isInsideClips(path: PdfPath, point: PaperPoint): boolean {
  return path.clips.every(clip => isInsideClip(clip, point))
}

function isInsideClip(clip: PdfClip, [x, y]: PaperPoint): boolean {
  let winding = 0
  let crossings = 0
  for (const { points } of clip.subpaths) {
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length]!
      if (a[1] <= y === b[1] <= y) return
      const crossingX = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
      if (crossingX <= x) return
      crossings++
      winding += b[1] > a[1] ? 1 : -1
    })
  }
  return clip.evenOdd ? crossings % 2 === 1 : winding !== 0
}
