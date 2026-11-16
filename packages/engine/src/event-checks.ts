import {
  areSimilarCodes,
  controlSpacingForScale,
  SIMILAR_CODES_NEAR_METERS,
  type EventCheckKind,
} from '@ratamestari/rules'
import { descriptionFeatureOf, type ControlSiteCandidate } from './control-sites'
import type { EventControl, EventPlan } from './event'
import { isSameSite } from './locks'

export interface EventFinding {
  readonly kind: EventCheckKind
  // The two controls the finding is about, by event control id.
  readonly controlIds: readonly [string, string]
  readonly courseIds: readonly string[]
  readonly meters: number
}

const siteDistance = (a: ControlSiteCandidate, b: ControlSiteCandidate) =>
  Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1])

const distance = (a: EventControl, b: EventControl) => siteDistance(a.site, b.site)

function isSimilarSite(a: ControlSiteCandidate, b: ControlSiteCandidate): boolean {
  const feature = descriptionFeatureOf(a)
  return feature !== null && feature === descriptionFeatureOf(b)
}

const isSimilarFeature = (a: EventControl, b: EventControl) => isSimilarSite(a.site, b.site)

// A site a course may use beside other courses' controls (LS 11.41, IOF 19.4): the same site, which
// the courses then share, or one far enough from each.
export function keepsClearOf(
  site: ControlSiteCandidate,
  others: readonly ControlSiteCandidate[],
  mapScale: number,
): boolean {
  const spacing = controlSpacingForScale(mapScale)
  return others.every(other => {
    if (isSameSite(site, other)) return true
    const meters = siteDistance(site, other)
    if (meters < spacing.minStraightMeters) return false
    return meters >= spacing.minStraightMetersForSimilarSites || !isSimilarSite(site, other)
  })
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
