import { paperPoint, type PaperPoint } from '@ratamestari/core'
import { describe, expect, it } from 'vitest'
import { detectCourse, isOverprintColor, type OverprintPath } from '../src'

const RADIUS = 375

const arc = (cx: number, cy: number, radius: number, fromDegrees: number, toDegrees: number) =>
  Array.from({ length: 40 }, (_, i) => {
    const angle = ((fromDegrees + ((toDegrees - fromDegrees) * i) / 39) * Math.PI) / 180
    return paperPoint(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle))
  })

const stroke = (...subpaths: PaperPoint[][]): OverprintPath => ({
  subpaths: subpaths.map(points => ({ points, closed: false })),
  stroked: true,
  filled: false,
})

const fill = (points: PaperPoint[]): OverprintPath => ({
  subpaths: [{ points, closed: true }],
  stroked: false,
  filled: true,
})

const line = (from: PaperPoint, to: PaperPoint, gap: number) => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const [dx, dy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
  return [
    paperPoint(from[0] + dx * gap, from[1] + dy * gap),
    paperPoint(to[0] - dx * gap, to[1] - dy * gap),
  ]
}

const triangle = (cx: number, cy: number, side: number) => {
  const circumradius = side / Math.sqrt(3)
  return [90, 210, 330, 90].map(degrees =>
    paperPoint(
      cx + circumradius * Math.cos((degrees * Math.PI) / 180),
      cy + circumradius * Math.sin((degrees * Math.PI) / 180),
    ),
  )
}

describe('detectCourse', () => {
  it('reads start, controls in order and finish, and which paths draw the course', () => {
    const start = paperPoint(0, 0)
    const controls = [paperPoint(4000, 1000), paperPoint(2000, 5000), paperPoint(6000, 6000)]
    const finish = paperPoint(9000, 3000)
    const gap = RADIUS + 50
    const paths: OverprintPath[] = [
      stroke(triangle(start[0], start[1], 2 * RADIUS * 1.2)),
      stroke(arc(4000, 1000, RADIUS, 0, 150), arc(4000, 1000, RADIUS, 200, 340)),
      stroke(arc(2000, 5000, RADIUS, 0, 360)),
      stroke(arc(6000, 6000, RADIUS, 30, 300)),
      stroke(arc(9000, 3000, RADIUS * 0.8, 0, 360)),
      stroke(arc(9000, 3000, RADIUS * 1.2, 0, 360)),
      stroke(line(start, controls[0]!, gap)),
      stroke(...splitInTwo(line(controls[0]!, controls[1]!, gap))),
      stroke(line(controls[1]!, controls[2]!, gap)),
      stroke(line(controls[2]!, finish, RADIUS * 1.2 + 50)),
      fill(arc(4500, 1500, 200, 0, 360)),
      fill([paperPoint(-3000, -3000), paperPoint(-1500, -3000), paperPoint(-1500, -1500)]),
    ]

    const course = detectCourse(paths)!

    expect(course.ordered).toBe(true)
    expect(course.controlRadius).toBeCloseTo(RADIUS, -1)
    expectNear(course.start!, start)
    expectNear(course.finish!, finish)
    course.controls.forEach((control, i) => expectNear(control, controls[i]!))
    expect([...course.coursePathIndices].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
  })

  it('finds controls without an order on a map that shows all controls', () => {
    const course = detectCourse([
      stroke(arc(0, 0, RADIUS, 0, 360)),
      stroke(arc(3000, 0, RADIUS, 0, 360)),
      stroke(arc(0, 3000, RADIUS, 0, 360)),
    ])!

    expect(course.ordered).toBe(false)
    expect(course.controls).toHaveLength(3)
  })

  it('finds nothing without circles', () => {
    expect(detectCourse([stroke(line(paperPoint(0, 0), paperPoint(5000, 0), 0))])).toBeNull()
  })
})

describe('isOverprintColor', () => {
  it('accepts the purples producers use and rejects map colours', () => {
    for (const purple of ['#a749a5', '#cd2d98', '#ec008c'])
      expect(isOverprintColor(purple)).toBe(true)
    for (const other of ['#d96425', '#0092d4', '#2c2e35', '#cce9c4', '#ffe4b2', '#ffffff']) {
      expect(isOverprintColor(other)).toBe(false)
    }
  })
})

function splitInTwo([from, to]: PaperPoint[]): PaperPoint[][] {
  const middle = (share: number) =>
    paperPoint(from![0] + (to![0] - from![0]) * share, from![1] + (to![1] - from![1]) * share)
  return [
    [from!, middle(0.45)],
    [middle(0.55), to!],
  ]
}

function expectNear(actual: PaperPoint, expected: PaperPoint) {
  expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1])).toBeLessThan(20)
}
