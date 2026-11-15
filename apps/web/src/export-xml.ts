import type { MapInfo } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { courseDataXml, type DescriptionSheet } from '@ratamestari/iof'
import type { Format } from '@ratamestari/rules'
import { saveFile } from './save-file'

export function downloadCourseXml(
  course: Course,
  sheet: DescriptionSheet,
  { eventName, className, format }: { eventName: string; className: string; format: Format },
  map: MapInfo,
) {
  const xml = courseDataXml({
    eventName,
    className,
    course,
    sheet,
    map,
    createdAt: new Date(),
  })
  saveFile(new Blob([xml], { type: 'application/xml' }), `${sheet.courseName}-${format}.xml`)
}
