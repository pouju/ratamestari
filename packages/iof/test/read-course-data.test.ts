import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, type MapInfo } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { descriptionSheet } from '../src/description-sheet'
import { courseDataXml } from '../src/iof-xml'
import { readCourseData } from '../src/read-course-data'
import { site } from './fixtures'

const OCAD_STYLE = `<?xml version="1.0" encoding="UTF-8" ?>
<CourseData xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0">
  <Event><Name>Rannikkorastit</Name></Event>
  <RaceCourseData>
    <Map><Scale>15000</Scale></Map>
    <Control type="Start"><Id>L1</Id><MapPosition x="-376.1" y="52.9" unit="mm" /></Control>
    <Control type="Control"><Id>33</Id><Position lng="27.2" lat="60.6" /><MapPosition x="-352.0" y="60.1" unit="mm" /></Control>
    <Control type="Finish"><Id>M1</Id><MapPosition unit="mm" y="40.0" x="-370.0" /></Control>
    <Course>
      <Name>A</Name>
      <Length>5060</Length>
      <CourseControl type="Start"><Control>L1</Control></CourseControl>
      <CourseControl type="Control"><Control>33</Control><LegLength>332</LegLength></CourseControl>
      <CourseControl type="Finish"><Control>M1</Control></CourseControl>
    </Course>
  </RaceCourseData>
</CourseData>`

describe('readCourseData', () => {
  it('reads controls and courses from an OCAD export', () => {
    const data = readCourseData(OCAD_STYLE)
    expect(data.eventName).toBe('Rannikkorastit')
    expect(data.mapScale).toBe(15000)
    expect(data.controls.get('33')).toEqual({
      id: '33',
      type: 'Control',
      mapPositionMillimetres: [-352, 60.1],
      longitudeLatitude: [27.2, 60.6],
      projected: null,
    })
    expect(data.controls.get('M1')!.mapPositionMillimetres).toEqual([-370, 40])
    expect(data.courses).toEqual([
      { name: 'A', lengthMeters: 5060, controlIds: ['L1', '33', 'M1'] },
    ])
  })

  it('reads back what our own export writes', () => {
    const course = {
      seed: 1,
      start: site({ position: localPoint(150, 300) }),
      controls: [site({ position: localPoint(450, 600) })],
      finish: localPoint(300, 150),
      controlDifficulties: [4],
      flagSides: [null],
      legSeconds: [100, 100],
      estimatedSeconds: 200,
      targetSeconds: 200,
      lengthMeters: 800,
      climbMeters: 10,
      problems: {
        spacing: 0,
        acuteAngleWarnings: 0,
        acuteAngleNotes: 0,
        difficultyOutsideRange: 0,
        courseLineCrossings: 0,
        courseLinesThroughControls: 0,
        courseLinesOutsideMap: 0,
        courseLinesOverDescriptions: 0,
        overlappingCircles: 0,
        finalLegTooLong: false,
        winningTimeOutsideRange: false,
        controlsWithoutFeature: 0,
      },
      printArea: null,
      findings: [],
      breakdown: { total: 0, terms: {} } as unknown as Course['breakdown'],
      score: 0,
    } satisfies Course
    const map: MapInfo = { scale: 15000, extent: localExtent(0, 0, 1000, 1000), georef: null }
    const xml = courseDataXml({
      eventName: 'Test',
      className: 'H21',
      course,
      sheet: descriptionSheet(course, { title: 'Test', courseName: 'H21' }),
      map,
      createdAt: new Date(0),
    })
    const data = readCourseData(xml)
    expect(data.courses[0]!.controlIds).toEqual(['S1', '31', 'F1'])
    expect(data.controls.get('31')!.mapPositionMillimetres).toEqual([30, 40])
  })

  it('reads the older IOF XML 2.0.3 that OCAD still writes', () => {
    const data = readCourseData(`<?xml version="1.0" encoding="UTF-8" ?>
<CourseData>
  <IOFVersion version="2.0.3" />
  <Map><Scale> 15000 </Scale></Map>
  <StartPoint><StartPointCode> L1 </StartPointCode><ControlPosition x="506337.774" y="6718325.210"/><MapPosition x="-47.3" y="13.5"/></StartPoint>
  <Control><ControlCode> 33 </ControlCode><ControlPosition x="506112.8" y="6718391.4"/><MapPosition x="-62.8" y="15.2"/></Control>
  <FinishPoint><FinishPointCode> M1 </FinishPointCode><MapPosition x="-50" y="10"/></FinishPoint>
  <Course>
    <CourseName> Rata A </CourseName>
    <CourseVariation>
      <CourseLength> 6210 </CourseLength>
      <StartPointCode> L1 </StartPointCode>
      <CourseControl><Sequence> 1 </Sequence><ControlCode> 33 </ControlCode></CourseControl>
      <FinishPointCode> M1 </FinishPointCode>
    </CourseVariation>
  </Course>
</CourseData>`)
    expect(data.mapScale).toBe(15000)
    expect(data.controls.get('L1')).toEqual({
      id: 'L1',
      type: 'Start',
      mapPositionMillimetres: [-47.3, 13.5],
      longitudeLatitude: null,
      projected: [506337.774, 6718325.21],
    })
    expect(data.courses).toEqual([
      { name: 'Rata A', lengthMeters: 6210, controlIds: ['L1', '33', 'M1'] },
    ])
  })
})
