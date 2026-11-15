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

export interface EventCourseData {
  readonly className: string
  readonly course: Course
  // Its rows carry the event's control codes (D27), so shared controls keep one code.
  readonly sheet: DescriptionSheet
}

export interface EventDataOptions {
  readonly eventName: string
  readonly courses: readonly EventCourseData[]
  readonly map: MapInfo
  readonly createdAt: Date
}

const IOF_NAMESPACE = 'http://www.orienteering.org/datastandard/3.0'
const CREATOR = 'Ratamestari'
const MILLIMETRES_PER_METRE = 1000
const COORDINATE_DECIMALS = 7
const MAP_DECIMALS = 2

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const distance = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

export function courseDataXml({ className, course, sheet, ...rest }: CourseDataOptions): string {
  return eventCourseDataXml({ ...rest, courses: [{ className, course, sheet }] })
}

// All courses of an event in one file: each control once, by its code, so OCAD, Condes and
// Purple Pen open the event with its shared controls (D27). Courses starting or finishing at the
// same point share that start or finish.
export function eventCourseDataXml({
  eventName,
  courses,
  map,
  createdAt,
}: EventDataOptions): string {
  const toMapMillimetres = (metres: number) =>
    ((metres * MILLIMETRES_PER_METRE) / map.scale).toFixed(MAP_DECIMALS)
  // The schema text says y grows downwards, but OCAD writes and reads paper coordinates with
  // y growing upwards (checked against OCAD 2020 exports), so we follow OCAD.
  const mapPosition = ([x, y]: LocalPoint, element = 'MapPosition') =>
    `<${element} x="${toMapMillimetres(x)}" y="${toMapMillimetres(y)}" unit="mm"/>`
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

  const idsAt = (prefix: string, points: readonly LocalPoint[]) => {
    const unique: LocalPoint[] = []
    const ids = points.map(point => {
      let index = unique.findIndex(other => other[0] === point[0] && other[1] === point[1])
      if (index < 0) index = unique.push(point) - 1
      return `${prefix}${index + 1}`
    })
    return { ids, unique }
  }
  const starts = idsAt(
    'S',
    courses.map(({ course }) => course.start.position),
  )
  const finishes = idsAt(
    'F',
    courses.map(({ course }) => course.finish),
  )
  const controlsByCode = new Map<string, LocalPoint>()
  for (const { course, sheet } of courses) {
    course.controls.forEach((site, i) => {
      const code = String(sheet.controls[i]!.code)
      if (!controlsByCode.has(code)) controlsByCode.set(code, site.position)
    })
  }

  const courseElement = ({ course, sheet }: EventCourseData, k: number) => {
    const stops = [
      course.start.position,
      ...course.controls.map(site => site.position),
      course.finish,
    ]
    const legLength = (i: number) => Math.round(distance(stops[i - 1]!, stops[i]!))
    return [
      '<Course>',
      `<Name>${escapeXml(sheet.courseName)}</Name>`,
      course.lengthMeters === null ? '' : `<Length>${Math.round(course.lengthMeters)}</Length>`,
      sheet.climbMeters === null ? '' : `<Climb>${sheet.climbMeters}</Climb>`,
      `<CourseControl type="Start"><Control>${starts.ids[k]}</Control></CourseControl>`,
      ...sheet.controls.map(
        (row, i) =>
          `<CourseControl type="Control"><Control>${row.code}</Control><MapText>${i + 1}</MapText>` +
          `<LegLength>${legLength(i + 1)}</LegLength></CourseControl>`,
      ),
      `<CourseControl type="Finish"${sheet.finish.route === 'tapedAllTheWay' ? ' specialInstruction="TapedRoute"' : ''}>` +
        `<Control>${finishes.ids[k]}</Control><LegLength>${legLength(stops.length - 1)}</LegLength></CourseControl>`,
      '</Course>',
    ]
  }

  const [minX, minY, maxX, maxY] = map.extent
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<CourseData xmlns="${IOF_NAMESPACE}" iofVersion="3.0" createTime="${createdAt.toISOString()}" creator="${CREATOR}">`,
    `<Event><Name>${escapeXml(eventName)}</Name></Event>`,
    '<RaceCourseData>',
    `<Map><Scale>${map.scale}</Scale>${mapPosition(localPoint(minX, maxY), 'MapPositionTopLeft')}` +
      `${mapPosition(localPoint(maxX, minY), 'MapPositionBottomRight')}</Map>`,
    ...starts.unique.map((point, i) => control(`S${i + 1}`, point, 'Start')),
    ...[...controlsByCode].map(([code, point]) => control(code, point)),
    ...finishes.unique.map((point, i) => control(`F${i + 1}`, point, 'Finish')),
    ...courses.flatMap(courseElement),
    ...courses.map(
      ({ className, sheet }) =>
        `<ClassCourseAssignment><ClassName>${escapeXml(className)}</ClassName>` +
        `<CourseName>${escapeXml(sheet.courseName)}</CourseName></ClassCourseAssignment>`,
    ),
    '</RaceCourseData>',
    '</CourseData>',
    '',
  ]
    .filter(line => line !== '')
    .join('\n')
    .concat('\n')
}

export interface CourseStopsOptions {
  readonly eventName: string
  readonly courseName: string
  readonly start: LocalPoint
  readonly controls: readonly { readonly code: string; readonly position: LocalPoint }[]
  readonly finish: LocalPoint
  readonly map: MapInfo
  readonly createdAt: Date
}

// A course known only by its stops, such as one read from a printed map.
export function courseStopsXml({
  eventName,
  courseName,
  start,
  controls,
  finish,
  map,
  createdAt,
}: CourseStopsOptions): string {
  const toMapMillimetres = (metres: number) =>
    ((metres * MILLIMETRES_PER_METRE) / map.scale).toFixed(MAP_DECIMALS)
  const control = (id: string, [x, y]: LocalPoint, type: 'Start' | 'Control' | 'Finish') =>
    `<Control type="${type}"><Id>${escapeXml(id)}</Id>` +
    `<MapPosition x="${toMapMillimetres(x)}" y="${toMapMillimetres(y)}" unit="mm"/></Control>`
  const courseControl = (id: string, type: 'Start' | 'Control' | 'Finish') =>
    `<CourseControl type="${type}"><Control>${escapeXml(id)}</Control></CourseControl>`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<CourseData xmlns="${IOF_NAMESPACE}" iofVersion="3.0" createTime="${createdAt.toISOString()}" creator="${CREATOR}">`,
    `<Event><Name>${escapeXml(eventName)}</Name></Event>`,
    '<RaceCourseData>',
    `<Map><Scale>${map.scale}</Scale></Map>`,
    control('S1', start, 'Start'),
    ...controls.map(({ code, position }) => control(code, position, 'Control')),
    control('F1', finish, 'Finish'),
    '<Course>',
    `<Name>${escapeXml(courseName)}</Name>`,
    courseControl('S1', 'Start'),
    ...controls.map(({ code }) => courseControl(code, 'Control')),
    courseControl('F1', 'Finish'),
    '</Course>',
    '</RaceCourseData>',
    '</CourseData>',
    '',
  ].join('\n')
}
