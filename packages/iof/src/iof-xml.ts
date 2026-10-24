import {
  localPoint,
  localToProjected,
  projectedToGeographic,
  type LocalPoint,
  type MapInfo,
} from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import type { DescriptionSheet } from './description-sheet'

export interface CourseDataOptions {
  readonly eventName: string
  readonly className: string
  readonly course: Course
  readonly sheet: DescriptionSheet
  readonly map: MapInfo
  readonly createdAt: Date
}

const IOF_NAMESPACE = 'http://www.orienteering.org/datastandard/3.0'
const CREATOR = 'Ratamestari'
const START_ID = 'S1'
const FINISH_ID = 'F1'
const MILLIMETRES_PER_METRE = 1000
const COORDINATE_DECIMALS = 7
const MAP_DECIMALS = 2

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const distance = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

export function courseDataXml({
  eventName,
  className,
  course,
  sheet,
  map,
  createdAt,
}: CourseDataOptions): string {
  const toMapMillimetres = (metres: number) =>
    ((metres * MILLIMETRES_PER_METRE) / map.scale).toFixed(MAP_DECIMALS)
  // IOF MapPosition y grows downwards; the local frame's y grows north.
  const mapPosition = ([x, y]: LocalPoint, element = 'MapPosition') =>
    `<${element} x="${toMapMillimetres(x)}" y="${toMapMillimetres(-y)}" unit="mm"/>`
  const geoPosition = (point: LocalPoint) => {
    if (!map.georef) return ''
    const geographic = projectedToGeographic(localToProjected(point, map.georef), map.georef.epsg)
    if (!geographic) return ''
    const lng = geographic.longitudeDegrees.toFixed(COORDINATE_DECIMALS)
    const lat = geographic.latitudeDegrees.toFixed(COORDINATE_DECIMALS)
    return `<Position lng="${lng}" lat="${lat}"/>`
  }
  const control = (id: string, point: LocalPoint, type?: 'Start' | 'Finish') =>
    `<Control${type ? ` type="${type}"` : ''}><Id>${id}</Id>${geoPosition(point)}${mapPosition(point)}</Control>`

  const [minX, minY, maxX, maxY] = map.extent
  const stops = [
    course.start.position,
    ...course.controls.map(site => site.position),
    course.finish,
  ]
  const codes = sheet.controls.map(row => String(row.code))
  const legLength = (i: number) => Math.round(distance(stops[i - 1]!, stops[i]!))

  const courseControls = [
    `<CourseControl type="Start"><Control>${START_ID}</Control></CourseControl>`,
    ...codes.map(
      (code, i) =>
        `<CourseControl type="Control"><Control>${code}</Control><MapText>${i + 1}</MapText>` +
        `<LegLength>${legLength(i + 1)}</LegLength></CourseControl>`,
    ),
    `<CourseControl type="Finish"${sheet.finish.route === 'tapedAllTheWay' ? ' specialInstruction="TapedRoute"' : ''}>` +
      `<Control>${FINISH_ID}</Control><LegLength>${legLength(stops.length - 1)}</LegLength></CourseControl>`,
  ]

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<CourseData xmlns="${IOF_NAMESPACE}" iofVersion="3.0" createTime="${createdAt.toISOString()}" creator="${CREATOR}">`,
    `<Event><Name>${escapeXml(eventName)}</Name></Event>`,
    '<RaceCourseData>',
    `<Map><Scale>${map.scale}</Scale>${mapPosition(localPoint(minX, maxY), 'MapPositionTopLeft')}` +
      `${mapPosition(localPoint(maxX, minY), 'MapPositionBottomRight')}</Map>`,
    control(START_ID, course.start.position, 'Start'),
    ...course.controls.map((site, i) => control(codes[i]!, site.position)),
    control(FINISH_ID, course.finish, 'Finish'),
    '<Course>',
    `<Name>${escapeXml(sheet.courseName)}</Name>`,
    course.lengthMeters === null ? '' : `<Length>${Math.round(course.lengthMeters)}</Length>`,
    sheet.climbMeters === null ? '' : `<Climb>${sheet.climbMeters}</Climb>`,
    ...courseControls,
    '</Course>',
    `<ClassCourseAssignment><ClassName>${escapeXml(className)}</ClassName>` +
      `<CourseName>${escapeXml(sheet.courseName)}</CourseName></ClassCourseAssignment>`,
    '</RaceCourseData>',
    '</CourseData>',
    '',
  ]
    .filter(line => line !== '')
    .join('\n')
    .concat('\n')
}
