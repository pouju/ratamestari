import { paperPoint, type PaperPoint } from '@ratamestari/core'

export interface FittedCircle {
  readonly centre: PaperPoint
  readonly radius: number
  readonly rmsError: number
}

export interface CircleGroup extends FittedCircle {
  readonly coverageRadians: number
  readonly arcs: readonly { readonly pathIndex: number; readonly points: readonly PaperPoint[] }[]
}

const MIN_ARC_POINTS = 6
const MAX_RELATIVE_FIT_ERROR = 0.03
const MAX_ARC_SAGITTA_SHARE = 0.02
const SAME_CIRCLE_TOLERANCE = 0.15
const COVERAGE_BINS = 72

// Algebraic (Kåsa) least-squares circle fit.
export function fitCircle(points: readonly PaperPoint[]): FittedCircle | null {
  if (points.length < 3) return null
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length
  let [suu, svv, suv, suuu, svvv, suvv, svuu] = [0, 0, 0, 0, 0, 0, 0]
  for (const [x, y] of points) {
    const [u, v] = [x - meanX, y - meanY]
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const determinant = suu * svv - suv * suv
  if (Math.abs(determinant) < 1e-9) return null
  const rightU = (suuu + suvv) / 2
  const rightV = (svvv + svuu) / 2
  const uc = (rightU * svv - rightV * suv) / determinant
  const vc = (suu * rightV - suv * rightU) / determinant
  const radius = Math.sqrt(uc * uc + vc * vc + (suu + svv) / points.length)
  const centre = paperPoint(meanX + uc, meanY + vc)
  const squaredErrors = points.map(
    ([x, y]) => (Math.hypot(x - centre[0], y - centre[1]) - radius) ** 2,
  )
  const rmsError = Math.sqrt(squaredErrors.reduce((sum, e) => sum + e, 0) / points.length)
  return { centre, radius, rmsError }
}

export function findCircleGroups(
  strokes: readonly { readonly pathIndex: number; readonly points: readonly PaperPoint[] }[],
): CircleGroup[] {
  const arcs = strokes.flatMap(stroke => {
    if (stroke.points.length < MIN_ARC_POINTS || isStraight(stroke.points)) return []
    const circle = fitCircle(stroke.points)
    if (!circle || circle.rmsError > circle.radius * MAX_RELATIVE_FIT_ERROR) return []
    return [{ ...stroke, circle }]
  })

  const groups: (typeof arcs)[] = []
  for (const arc of arcs) {
    const group = groups.find(members => isSameCircle(members[0]!.circle, arc.circle))
    if (group) group.push(arc)
    else groups.push([arc])
  }

  return groups.flatMap(members => {
    const points = members.flatMap(member => member.points)
    const circle = fitCircle(points)
    if (!circle) return []
    return [
      {
        ...circle,
        coverageRadians: angularCoverage(circle.centre, points),
        arcs: members.map(({ pathIndex, points }) => ({ pathIndex, points })),
      },
    ]
  })
}

export function isSameCircle(a: FittedCircle, b: FittedCircle): boolean {
  const radius = Math.max(a.radius, b.radius)
  return (
    Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]) <
      radius * SAME_CIRCLE_TOLERANCE &&
    Math.abs(a.radius - b.radius) < radius * SAME_CIRCLE_TOLERANCE
  )
}

export function isStraight(points: readonly PaperPoint[]): boolean {
  const first = points[0]!
  const last = points[points.length - 1]!
  const length = Math.hypot(last[0] - first[0], last[1] - first[1])
  if (length === 0) return false
  const largestOffset = Math.max(
    ...points.map(
      ([x, y]) =>
        Math.abs((last[0] - first[0]) * (first[1] - y) - (first[0] - x) * (last[1] - first[1])) /
        length,
    ),
  )
  return largestOffset <= length * MAX_ARC_SAGITTA_SHARE
}

function angularCoverage(centre: PaperPoint, points: readonly PaperPoint[]): number {
  const bins = new Set(
    points.map(([x, y]) => {
      const angle = Math.atan2(y - centre[1], x - centre[0]) + Math.PI
      return Math.min(COVERAGE_BINS - 1, Math.floor((angle / (2 * Math.PI)) * COVERAGE_BINS))
    }),
  )
  return (bins.size / COVERAGE_BINS) * 2 * Math.PI
}
