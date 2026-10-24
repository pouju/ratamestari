export interface ImportedControl {
  readonly id: string
  readonly type: 'Control' | 'Start' | 'Finish' | 'CrossingPoint' | 'EndOfMarkedRoute'
  readonly mapPositionMillimetres: readonly [x: number, y: number] | null
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

// Reads the parts of an IOF XML 3.0 CourseData message the planner needs. Map positions are
// kept as written: millimetres on the OCAD paper, y growing upwards (see iof-xml.ts).
export function readCourseData(xml: string): ImportedCourseData {
  const raceCourseData = blocks(xml, 'RaceCourseData')[0]?.body ?? xml
  const controls = new Map<string, ImportedControl>()
  for (const { attributes, body } of blocks(raceCourseData, 'Control')) {
    const id = text(body, 'Id')
    if (!id) continue
    const type = attribute(attributes, 'type') ?? 'Control'
    const position = /<MapPosition\b([^>]*)\/?>/.exec(body)?.[1]
    const x = position ? Number(attribute(position, 'x')) : Number.NaN
    const y = position ? Number(attribute(position, 'y')) : Number.NaN
    controls.set(id, {
      id,
      type: CONTROL_TYPES.has(type as ImportedControl['type'])
        ? (type as ImportedControl['type'])
        : 'Control',
      mapPositionMillimetres: Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null,
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
