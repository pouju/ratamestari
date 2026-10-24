import type { MapInfo } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { courseDataXml, type DescriptionSheet } from '@ratamestari/iof'
import type { CourseRequest } from '@ratamestari/rules'
import { courseNameOf, EVENT_LEVEL_LABELS, FORMAT_LABELS } from './course-labels'

const BLOB_URL_LIFETIME_MS = 10_000

export function downloadCourseXml(
  course: Course,
  sheet: DescriptionSheet,
  request: CourseRequest,
  map: MapInfo,
) {
  const xml = courseDataXml({
    eventName: `${EVENT_LEVEL_LABELS[request.eventLevel]}, ${FORMAT_LABELS[request.format]}`,
    className: courseNameOf(request),
    course,
    sheet,
    map,
    createdAt: new Date(),
  })
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${sheet.courseName}-${request.format}.xml`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS)
}
