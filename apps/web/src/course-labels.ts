import type { CourseRequest } from '@ratamestari/rules'

const MAIN_CLASS_LETTER = 'A'

export const courseNameOf = ({ sex, ageClass, skillLetter }: CourseRequest) =>
  `${sex}${ageClass}${skillLetter === MAIN_CLASS_LETTER ? '' : skillLetter}`
