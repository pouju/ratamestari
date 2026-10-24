import type { LocalPoint } from '@ratamestari/core'
import { COURSE_SHAPE, type FormatQualityProfile } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import type { Random } from './random'

const MIN_ZONE_QUALITY = 0.5
const TURN_BACK_COST_FACTOR = 2

const distance = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

function turnDegrees(from: LocalPoint, at: LocalPoint, to: LocalPoint): number {
  const inX = at[0] - from[0]
  const inY = at[1] - from[1]
  const outX = to[0] - at[0]
  const outY = to[1] - at[1]
  return Math.abs((Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY) * 180) / Math.PI)
}

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items]
    return
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const tail of permutations(rest)) yield [items[i]!, ...tail]
  }
}

// Areas of good terrain the course should pass through, in visiting order from the finish
// round to the finish again. They give the course its shape before the controls are filled in.
export function planWaypoints(
  pool: readonly ControlSiteCandidate[],
  quality: Float32Array,
  finish: LocalPoint,
  profile: FormatQualityProfile,
  random: Random,
): LocalPoint[] {
  const { count, minSeparationMetres } = profile.waypoints
  const wanted = count[0] + Math.floor(random.next() * (count[1] - count[0] + 1))
  const zones: LocalPoint[] = []
  const candidates = pool
    .map((site, i) => ({ position: site.position, weight: quality[i]! ** 2 }))
    .filter(({ weight }) => weight >= MIN_ZONE_QUALITY ** 2)
  while (zones.length < wanted) {
    const allowed = candidates.filter(
      ({ position }) =>
        distance(position, finish) >= minSeparationMetres / 2 &&
        zones.every(zone => distance(zone, position) >= minSeparationMetres),
    )
    const total = allowed.reduce((sum, { weight }) => sum + weight, 0)
    if (total === 0) break
    let pick = random.next() * total
    const chosen =
      allowed.find(({ weight }) => (pick -= weight) <= 0) ?? allowed[allowed.length - 1]!
    zones.push(chosen.position)
  }

  let best: { order: LocalPoint[]; cost: number } | null = null
  for (const order of permutations(zones)) {
    const tour = [finish, ...order, finish]
    let cost = 0
    for (let i = 1; i < tour.length; i++) {
      const length = distance(tour[i - 1]!, tour[i]!)
      const turnsBack =
        i + 1 < tour.length &&
        turnDegrees(tour[i - 1]!, tour[i]!, tour[i + 1]!) > COURSE_SHAPE.reversalDegrees
      cost += turnsBack ? length * TURN_BACK_COST_FACTOR : length
    }
    if (!best || cost < best.cost) best = { order, cost }
  }
  return best?.order ?? []
}
