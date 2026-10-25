import { describe, expect, it } from 'vitest'
import { localExtent, localPoint } from '@ratamestari/core'
import { courseStopsXml, importedCourseStops, readCourseData } from '../src'

describe('courseStopsXml', () => {
  it('writes a course that reads back to the same stops', () => {
    const map = { scale: 10000, extent: localExtent(0, 0, 2000, 2000), georef: null }
    const xml = courseStopsXml({
      eventName: 'Example Event',
      courseName: 'A',
      start: localPoint(100, 200),
      controls: [
        { code: '31', position: localPoint(500, 600) },
        { code: '32', position: localPoint(900, 300) },
      ],
      finish: localPoint(120, 180),
      map,
      createdAt: new Date('2026-10-25T12:00:00Z'),
    })

    const data = readCourseData(xml)
    const stops = importedCourseStops(data, data.courses[0]!, map.scale, null)!

    expect(data.courses[0]!.name).toBe('A')
    expect(stops.start).toEqual(localPoint(100, 200))
    expect(stops.controls).toEqual([localPoint(500, 600), localPoint(900, 300)])
    expect(stops.finish).toEqual(localPoint(120, 180))
    expect(stops.controlCodes).toEqual(['31', '32'])
  })
})
