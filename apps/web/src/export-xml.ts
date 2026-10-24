import type { MapInfo } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { courseDataXml, type DescriptionSheet } from '@ratamestari/iof'
import type { CourseRequest } from '@ratamestari/rules'
import { courseNameOf, EVENT_LEVEL_LABELS, FORMAT_LABELS } from './course-labels'
import { saveFile } from './save-file'

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
  saveFile(
    new Blob([xml], { type: 'application/xml' }),
    `${sheet.courseName}-${request.format}.xml`,
  )
}
