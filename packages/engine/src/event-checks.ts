import {
  areSimilarCodes,
  controlSpacingForScale,
  SIMILAR_CODES_NEAR_METERS,
  type EventCheckKind,
} from '@ratamestari/rules'
import { descriptionFeatureOf } from './control-sites'
import type { EventControl, EventPlan } from './event'

export interface EventFinding {
  readonly kind: EventCheckKind
  // The two controls the finding is about, by event control id.
  readonly controlIds: readonly [string, string]
  readonly courseIds: readonly string[]
  readonly meters: number
}

const distance = (a: EventControl, b: EventControl) =>
  Math.hypot(a.site.position[0] - b.site.position[0], a.site.position[1] - b.site.position[1])

function isSimilarFeature(a: EventControl, b: EventControl): boolean {
  const feature = descriptionFeatureOf(a.site)
  return feature !== null && feature === descriptionFeatureOf(b.site)
}

// What only shows when the event's courses are seen together; each course checks itself.
export function eventFindings(event: EventPlan, mapScale: number): EventFinding[] {
  const spacing = controlSpacingForScale(mapScale)
  const coursesOf = new Map(
    event.controls.map(control => [
      control.id,
      event.courses.filter(entry => entry.controlIds.includes(control.id)).map(entry => entry.id),
    ]),
  )
  const findings: EventFinding[] = []

  event.controls.forEach((a, i) => {
    for (const b of event.controls.slice(i + 1)) {
      const meters = distance(a, b)
      const coursesOfA = coursesOf.get(a.id) ?? []
      const coursesOfB = coursesOf.get(b.id) ?? []
      const courseIds = [...new Set([...coursesOfA, ...coursesOfB])]
      const shareACourse = coursesOfA.some(id => coursesOfB.includes(id))
      const found = (kind: EventCheckKind) =>
        findings.push({ kind, controlIds: [a.id, b.id], courseIds, meters })
      if (!shareACourse && meters < spacing.minStraightMeters) found('controlsTooClose')
      else if (
        !shareACourse &&
        meters < spacing.minStraightMetersForSimilarSites &&
        isSimilarFeature(a, b)
      )
        found('similarControlsClose')
      if (meters <= SIMILAR_CODES_NEAR_METERS && areSimilarCodes(a.code, b.code))
        found('similarCodesNear')
    }
  })

  const legs = new Map<string, Set<string>>()
  for (const entry of event.courses) {
    entry.controlIds.slice(1).forEach((to, k) => {
      const key = `${entry.controlIds[k]}>${to}`
      legs.set(key, (legs.get(key) ?? new Set()).add(entry.id))
    })
  }
  const controlById = new Map(event.controls.map(control => [control.id, control]))
  for (const [key, courses] of legs) {
    const [from, to] = key.split('>') as [string, string]
    const meters = distance(controlById.get(from)!, controlById.get(to)!)
    if (courses.size > 1)
      findings.push({
        kind: 'legSharedByCourses',
        controlIds: [from, to],
        courseIds: [...courses],
        meters,
      })
    const back = legs.get(`${to}>${from}`)
    const runsBothWays = back && [...back].some(id => !courses.has(id))
    if (runsBothWays && from < to)
      findings.push({
        kind: 'legRunBothWays',
        controlIds: [from, to],
        courseIds: [...new Set([...courses, ...back])],
        meters,
      })
  }
  return findings
}
