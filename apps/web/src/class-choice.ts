import {
  ageClassSchema,
  winningTimeFor,
  type AgeClass,
  type CourseRequest,
} from '@ratamestari/rules'

export const offeredAgeClasses = ({
  eventLevel,
  format,
}: Pick<CourseRequest, 'eventLevel' | 'format'>): AgeClass[] =>
  [...ageClassSchema.values].filter(age => winningTimeFor(eventLevel, format, age) !== null)

export interface ClassChoice {
  readonly request: CourseRequest
  readonly replacedAgeClass: AgeClass | null
}

// A class the rules have no winning time for can't be set, so the nearest one that can takes its
// place, the older one on a tie.
export function withOfferedClass(request: CourseRequest): ClassChoice {
  const offered = offeredAgeClasses(request)
  if (offered.includes(request.ageClass) || offered.length === 0)
    return { request, replacedAgeClass: null }
  const distance = (age: AgeClass) => Math.abs(age - request.ageClass)
  const nearest = offered.reduce((best, age) => (distance(age) <= distance(best) ? age : best))
  return { request: { ...request, ageClass: nearest }, replacedAgeClass: request.ageClass }
}
