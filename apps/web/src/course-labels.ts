import type { CourseRequest } from '@ratamestari/rules'

export const EVENT_LEVEL_LABELS: Record<CourseRequest['eventLevel'], string> = {
  national: 'National event',
  finnishChampionship: 'Finnish championship (SM) final',
}

export const FORMAT_LABELS: Record<CourseRequest['format'], string> = {
  long: 'Long distance',
  middle: 'Middle distance',
}

const MAIN_CLASS_LETTER = 'A'

export const courseNameOf = ({ sex, ageClass, skillLetter }: CourseRequest) =>
  `${sex}${ageClass}${skillLetter === MAIN_CLASS_LETTER ? '' : skillLetter}`
