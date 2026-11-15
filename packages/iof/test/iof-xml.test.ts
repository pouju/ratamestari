import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, projectedPoint, type MapInfo } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { descriptionSheet } from '../src/description-sheet'
import { courseDataXml, eventCourseDataXml } from '../src/iof-xml'
import { readCourseData } from '../src/read-course-data'
import { site } from './fixtures'

const course: Course = {
  seed: 1,
  start: site({ position: localPoint(100, 200) }),
  controls: [site({ position: localPoint(400, 600) }), site({ position: localPoint(700, 200) })],
  finish: localPoint(150, 150),
  controlDifficulties: [4, 4],
  flagSides: [null, null],
  legSeconds: [100, 100, 100],
  estimatedSeconds: 300,
  targetSeconds: 300,
  lengthMeters: 1712.4,
  climbMeters: 23,
  problems: {
    spacing: 0,
    acuteAngleWarnings: 0,
    acuteAngleNotes: 0,
    difficultyOutsideRange: 0,
    courseLineCrossings: 0,
    courseLinesThroughControls: 0,
    courseLinesOutsideMap: 0,
    courseLinesOverDescriptions: 0,
    stopsOutsidePrintArea: 0,
    overlappingCircles: 0,
    finalLegTooLong: false,
    winningTimeOutsideRange: false,
    controlsWithoutFeature: 0,
  },
  printArea: null,
  findings: [],
  breakdown: { total: 0, terms: {} } as unknown as Course['breakdown'],
  score: 0,
}

const map: MapInfo = {
  scale: 10000,
  extent: localExtent(0, 0, 1000, 800),
  georef: {
    epsg: 3067,
    originInProjected: projectedPoint(500000, 6651411.19),
    grivationRadians: 0,
  },
}

const xmlFor = (overrides: Partial<MapInfo> = {}) =>
  courseDataXml({
    eventName: 'Club night & test',
    className: 'H21',
    course,
    sheet: descriptionSheet(course, { title: 'Long distance', courseName: 'H21' }),
    map: { ...map, ...overrides },
    createdAt: new Date('2026-10-25T09:00:00Z'),
  })

describe('courseDataXml', () => {
  it('writes an IOF XML 3.0 CourseData message', () => {
    const xml = xmlFor()
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<CourseData /)
    expect(xml).toContain('xmlns="http://www.orienteering.org/datastandard/3.0"')
    expect(xml).toContain('iofVersion="3.0"')
    expect(xml).toContain('createTime="2026-10-25T09:00:00.000Z"')
    expect(xml).toContain('<Name>Club night &amp; test</Name>')
  })

  it('gives map positions in millimetres on the OCAD paper, y growing upwards', () => {
    const xml = xmlFor()
    expect(xml).toContain('<Scale>10000</Scale>')
    expect(xml).toContain('<MapPositionTopLeft x="0.00" y="80.00" unit="mm"/>')
    expect(xml).toContain('<MapPositionBottomRight x="100.00" y="0.00" unit="mm"/>')
    expect(xml).toContain(
      '<Id>31</Id><Position lng="27.0071725" lat="60.0053874"/><MapPosition x="40.00" y="60.00" unit="mm"/>',
    )
  })

  it('lists the course in order with the description codes, leg lengths, length and climb', () => {
    const xml = xmlFor()
    const controls = [
      ...xml.matchAll(/<CourseControl type="(\w+)"[^>]*><Control>(\w+)<\/Control>/g),
    ].map(match => `${match[1]}:${match[2]}`)
    expect(controls).toEqual(['Start:S1', 'Control:31', 'Control:32', 'Finish:F1'])
    expect(xml).toContain('<MapText>1</MapText><LegLength>500</LegLength>')
    expect(xml).toContain('<Length>1712</Length>')
    expect(xml).toContain('<Climb>25</Climb>')
    expect(xml).toContain('<ClassName>H21</ClassName><CourseName>H21</CourseName>')
  })

  it('leaves out geographic positions when the map has no known georeference', () => {
    expect(xmlFor({ georef: null })).not.toContain('<Position ')
  })

  it('writes a course with no controls yet, as one being set by hand', () => {
    const empty = { ...course, controls: [], controlDifficulties: [], flagSides: [] }
    const xml = courseDataXml({
      eventName: 'Club night',
      className: 'H21',
      course: empty,
      sheet: descriptionSheet(empty, { title: 'Long distance', courseName: 'H21' }),
      map,
      createdAt: new Date('2026-10-25T09:00:00Z'),
    })
    const controls = [
      ...xml.matchAll(/<CourseControl type="(\w+)"[^>]*><Control>(\w+)<\/Control>/g),
    ].map(match => `${match[1]}:${match[2]}`)
    expect(controls).toEqual(['Start:S1', 'Finish:F1'])
  })
})

describe('eventCourseDataXml', () => {
  // B shares A's second control (code 32) and its start and finish, and adds its own control 33.
  const b: Course = {
    ...course,
    controls: [course.controls[1]!, site({ position: localPoint(800, 500) })],
  }
  const xml = eventCourseDataXml({
    eventName: 'Weekly event',
    courses: [
      {
        className: 'A',
        course,
        sheet: descriptionSheet(course, { title: 'Open', courseName: 'A', controlCodes: [31, 32] }),
      },
      {
        className: 'B',
        course: b,
        sheet: descriptionSheet(b, { title: 'Open', courseName: 'B', controlCodes: [32, 33] }),
      },
    ],
    map,
    createdAt: new Date('2026-11-15T18:00:00Z'),
  })

  it('writes every course with its own controls in order', () => {
    const read = readCourseData(xml)
    expect(read.courses.map(entry => [entry.name, entry.controlIds])).toEqual([
      ['A', ['S1', '31', '32', 'F1']],
      ['B', ['S1', '32', '33', 'F1']],
    ])
  })

  it('lists a shared control, start and finish once', () => {
    expect([...readCourseData(xml).controls.keys()]).toEqual(['S1', '31', '32', '33', 'F1'])
  })

  it('assigns each course to its class', () => {
    expect(xml).toContain('<ClassName>A</ClassName><CourseName>A</CourseName>')
    expect(xml).toContain('<ClassName>B</ClassName><CourseName>B</CourseName>')
  })
})
