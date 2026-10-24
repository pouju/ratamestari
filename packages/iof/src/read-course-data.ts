export interface ImportedControl {
  readonly id: string
  readonly type: 'Control' | 'Start' | 'Finish' | 'CrossingPoint' | 'EndOfMarkedRoute'
  readonly mapPositionMillimetres: readonly [x: number, y: number] | null
  readonly longitudeLatitude: readonly [longitude: number, latitude: number] | null
  readonly projected: readonly [easting: number, northing: number] | null
}

export interface ImportedCourse {
  readonly name: string
  readonly lengthMeters: number | null
  readonly controlIds: readonly string[]
}

export interface ImportedCourseData {
  readonly eventName: string
  readonly mapScale: number | null
  readonly controls: ReadonlyMap<string, ImportedControl>
  readonly courses: readonly ImportedCourse[]
}

const CONTROL_TYPES = new Set<ImportedControl['type']>([
  'Control',
  'Start',
  'Finish',
  'CrossingPoint',
  'EndOfMarkedRoute',
])

const blocks = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'g'))].map(
    ([, attributes = '', body = '']) => ({ attributes, body }),
  )
const text = (xml: string, tag: string) =>
  new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`).exec(xml)?.[1]?.trim() ?? null
const attribute = (attributes: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? null

const numberPair = (attributes: string | undefined): readonly [number, number] | null => {
  if (attributes === undefined) return null
  const x = Number(attribute(attributes, 'x'))
  const y = Number(attribute(attributes, 'y'))
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

// Reads the parts of an IOF XML CourseData message the planner needs, from version 3.0 or the
// older 2.0.3 that OCAD still writes. Map positions are kept as written: millimetres on the OCAD
// paper, y growing upwards (see iof-xml.ts).
export function readCourseData(xml: string): ImportedCourseData {
  if (/<IOFVersion\b[^>]*version="2\./.test(xml)) return readVersion2(xml)
  const raceCourseData = blocks(xml, 'RaceCourseData')[0]?.body ?? xml
  const controls = new Map<string, ImportedControl>()
  for (const { attributes, body } of blocks(raceCourseData, 'Control')) {
    const id = text(body, 'Id')
    if (!id) continue
    const type = attribute(attributes, 'type') ?? 'Control'
    const geographic = /<Position\b([^>]*)\/?>/.exec(body)?.[1]
    const longitude = geographic ? Number(attribute(geographic, 'lng')) : Number.NaN
    const latitude = geographic ? Number(attribute(geographic, 'lat')) : Number.NaN
    const position = /<MapPosition\b([^>]*)\/?>/.exec(body)?.[1]
    const x = position ? Number(attribute(position, 'x')) : Number.NaN
    const y = position ? Number(attribute(position, 'y')) : Number.NaN
    controls.set(id, {
      id,
      type: CONTROL_TYPES.has(type as ImportedControl['type'])
        ? (type as ImportedControl['type'])
        : 'Control',
      mapPositionMillimetres: Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null,
      longitudeLatitude:
        Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null,
      projected: null,
    })
  }
  const courses = blocks(raceCourseData, 'Course').map(({ body }) => {
    const length = Number(text(body, 'Length'))
    return {
      name: text(body, 'Name') ?? '',
      lengthMeters: Number.isFinite(length) && length > 0 ? length : null,
      controlIds: blocks(body, 'CourseControl').flatMap(({ body: courseControl }) => {
        const id = text(courseControl, 'Control')
        return id ? [id] : []
      }),
    }
  })
  const scale = Number(text(blocks(raceCourseData, 'Map')[0]?.body ?? '', 'Scale'))
  return {
    eventName: text(blocks(xml, 'Event')[0]?.body ?? '', 'Name') ?? '',
    mapScale: Number.isFinite(scale) && scale > 0 ? scale : null,
    controls,
    courses,
  }
}

function readVersion2(xml: string): ImportedCourseData {
  const controls = new Map<string, ImportedControl>()
  const addPoints = (tag: string, codeTag: string, type: ImportedControl['type']) => {
    for (const { body } of blocks(xml, tag)) {
      const id = text(body, codeTag)
      if (!id) continue
      controls.set(id, {
        id,
        type,
        mapPositionMillimetres: numberPair(/<MapPosition\b([^>]*)\/?>/.exec(body)?.[1]),
        longitudeLatitude: null,
        projected: numberPair(/<ControlPosition\b([^>]*)\/?>/.exec(body)?.[1]),
      })
    }
  }
  addPoints('StartPoint', 'StartPointCode', 'Start')
  addPoints('Control', 'ControlCode', 'Control')
  addPoints('FinishPoint', 'FinishPointCode', 'Finish')
  const courses = blocks(xml, 'Course').flatMap(({ body }) => {
    const variation = blocks(body, 'CourseVariation')[0]?.body
    if (!variation) return []
    const sequence = blocks(variation, 'CourseControl')
      .map(({ body: courseControl }) => ({
        order: Number(text(courseControl, 'Sequence')),
        id: text(courseControl, 'ControlCode'),
      }))
      .filter((control): control is { order: number; id: string } => control.id !== null)
      .sort((a, b) => a.order - b.order)
      .map(control => control.id)
    const start = text(variation, 'StartPointCode')
    const finish = text(variation, 'FinishPointCode')
    const length = Number(text(variation, 'CourseLength'))
    return [
      {
        name: text(body, 'CourseName') ?? '',
        lengthMeters: Number.isFinite(length) && length > 0 ? length : null,
        controlIds: [...(start ? [start] : []), ...sequence, ...(finish ? [finish] : [])],
      },
    ]
  })
  const scale = Number(text(blocks(xml, 'Map')[0]?.body ?? '', 'Scale'))
  return {
    eventName: text(blocks(xml, 'Event')[0]?.body ?? '', 'Name') ?? '',
    mapScale: Number.isFinite(scale) && scale > 0 ? scale : null,
    controls,
    courses,
  }
}
