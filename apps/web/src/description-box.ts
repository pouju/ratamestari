import { localExtent, type LocalExtent, type MapInfo } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { descriptionSheet, renderDescriptionSheet, type DescriptionSheet } from '@ratamestari/iof'
import type { CourseRequest } from '@ratamestari/rules'
import { courseNameOf, FORMAT_LABELS } from './course-labels'

export interface DescriptionBox {
  readonly sheet: DescriptionSheet
  readonly url: string
  readonly extent: LocalExtent
}

const DISPLAY_PIXELS_PER_MILLIMETRE = 12
const MARGIN_MILLIMETRES = 5

const paperMillimetresToMeters = (millimetres: number, scale: number) =>
  (millimetres * scale) / 1000

export function descriptionBoxFor(
  course: Course,
  request: CourseRequest,
  map: MapInfo,
): DescriptionBox {
  const sheet = descriptionSheet(course, {
    title: FORMAT_LABELS[request.format],
    courseName: courseNameOf(request),
  })
  const rendered = renderDescriptionSheet(sheet, {
    pixelsPerMillimetre: DISPLAY_PIXELS_PER_MILLIMETRE,
  })
  const [minX, , , maxY] = map.extent
  const margin = paperMillimetresToMeters(MARGIN_MILLIMETRES, map.scale)
  const left = minX + margin
  const top = maxY - margin
  const extent = localExtent(
    left,
    top - paperMillimetresToMeters(rendered.heightMillimetres, map.scale),
    left + paperMillimetresToMeters(rendered.widthMillimetres, map.scale),
    top,
  )
  return {
    sheet,
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`,
    extent,
  }
}
