import {
  localPoint,
  localToProjected,
  projectedToGeographic,
  type Georef,
  type LocalPoint,
} from '@ratamestari/core'
import type { ImportedControl, ImportedCourse, ImportedCourseData } from './read-course-data'

export interface ImportedStops {
  readonly start: LocalPoint
  readonly controls: readonly LocalPoint[]
  readonly finish: LocalPoint
  readonly controlCodes: readonly string[]
  // How far the file's own ground positions lie from where its map positions put them on this
  // map, on average; large values mean the course was set on another map or version.
  readonly groundMismatchMetres: number | null
}

const METRES_PER_DEGREE_LATITUDE = 111_320

// Map positions are millimetres on the OCAD paper of the map the course was set on, y up.
export function importedCourseStops(
  data: ImportedCourseData,
  course: ImportedCourse,
  mapScale: number,
  georef: Georef | null,
): ImportedStops | null {
  const placed = course.controlIds.flatMap(id => {
    const control = data.controls.get(id)
    const position = control?.mapPositionMillimetres
    if (!control || !position) return []
    const local = localPoint((position[0] * mapScale) / 1000, (position[1] * mapScale) / 1000)
    return [{ control, local }]
  })
  const startIndex = placed.findIndex(({ control }) => control.type === 'Start')
  const finishIndex = placed.findLastIndex(({ control }) => control.type === 'Finish')
  const start = placed[startIndex === -1 ? 0 : startIndex]
  const finish = placed[finishIndex === -1 ? placed.length - 1 : finishIndex]
  if (!start || !finish || start === finish) return null
  const controls = placed.filter(
    ({ control }, i) =>
      control.type === 'Control' && i > placed.indexOf(start) && i < placed.indexOf(finish),
  )
  return {
    start: start.local,
    controls: controls.map(({ local }) => local),
    finish: finish.local,
    controlCodes: controls.map(({ control }) => control.id),
    groundMismatchMetres: georef ? groundMismatch(placed, georef) : null,
  }
}

function groundMismatch(
  placed: readonly { control: ImportedControl; local: LocalPoint }[],
  georef: Georef,
): number | null {
  const errors = placed.flatMap(({ control, local }) => {
    const projected = localToProjected(local, georef)
    if (control.projected) {
      return [Math.hypot(projected[0] - control.projected[0], projected[1] - control.projected[1])]
    }
    const given = control.longitudeLatitude
    const ground = given && projectedToGeographic(projected, georef.epsg)
    if (!given || !ground) return []
    const metresPerDegreeLongitude =
      METRES_PER_DEGREE_LATITUDE * Math.cos((given[1] * Math.PI) / 180)
    return [
      Math.hypot(
        (ground.longitudeDegrees - given[0]) * metresPerDegreeLongitude,
        (ground.latitudeDegrees - given[1]) * METRES_PER_DEGREE_LATITUDE,
      ),
    ]
  })
  return errors.length === 0 ? null : errors.reduce((sum, e) => sum + e, 0) / errors.length
}
