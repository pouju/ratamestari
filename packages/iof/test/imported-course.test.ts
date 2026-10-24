import { describe, expect, it } from 'vitest'
import { importedCourseStops } from '../src/imported-course'
import type { ImportedControl, ImportedCourseData } from '../src/read-course-data'

const control = (
  id: string,
  type: ImportedControl['type'],
  x: number,
  y: number,
): [string, ImportedControl] => [
  id,
  { id, type, mapPositionMillimetres: [x, y], longitudeLatitude: null, projected: null },
]

const data: ImportedCourseData = {
  eventName: 'Club night',
  mapScale: 10000,
  controls: new Map([
    control('S1', 'Start', 0, 0),
    control('31', 'Control', 10, 20),
    control('32', 'Control', 30, 10),
    control('F1', 'Finish', 5, -5),
  ]),
  courses: [{ name: 'H21', lengthMeters: 1200, controlIds: ['S1', '31', '32', 'F1'] }],
}

describe('importedCourseStops', () => {
  it("places the course on the map's ground frame from its paper positions", () => {
    const stops = importedCourseStops(data, data.courses[0]!, 15000, null)!
    expect(stops.start).toEqual([0, 0])
    expect(stops.controls).toEqual([
      [150, 300],
      [450, 150],
    ])
    expect(stops.finish).toEqual([75, -75])
    expect(stops.controlCodes).toEqual(['31', '32'])
    expect(stops.groundMismatchMetres).toBeNull()
  })

  it('gives up on a course without a start and a finish', () => {
    const shortCourse = { name: 'X', lengthMeters: null, controlIds: ['31'] }
    expect(importedCourseStops(data, shortCourse, 15000, null)).toBeNull()
  })
})
