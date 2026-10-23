import type { LocalPoint } from '@ratamestari/core'
import type { ControlSiteCandidate } from './control-sites'

const NEIGHBOURHOOD_RADIUS_METERS = 150
const DEMANDING_SITE_WEIGHT = 1
const EASY_SITE_WEIGHT = 0.2
const CONTOUR_DETAIL_BONUS = 0.5
const SLOW_TERRAIN_FACTOR = 0.5
const NORMALISING_PERCENTILE = 0.9
const DEMANDING_FROM_DIFFICULTY = 3

const isContourDetail = (site: ControlSiteCandidate) =>
  site.placement === 'contourKnoll' || site.placement === 'contourBend' || site.contourForm !== null

const weightOf = (site: ControlSiteCandidate) =>
  (site.technicalDifficulty >= DEMANDING_FROM_DIFFICULTY
    ? DEMANDING_SITE_WEIGHT
    : EASY_SITE_WEIGHT) + (isContourDetail(site) ? CONTOUR_DETAIL_BONUS : 0)

export function siteAreaQuality(sites: readonly ControlSiteCandidate[]): Float32Array {
  const bucketOf = ([x, y]: LocalPoint) =>
    [
      Math.floor(x / NEIGHBOURHOOD_RADIUS_METERS),
      Math.floor(y / NEIGHBOURHOOD_RADIUS_METERS),
    ] as const
  const buckets = new Map<string, number[]>()
  sites.forEach((site, i) => {
    const key = bucketOf(site.position).join(',')
    const bucket = buckets.get(key)
    if (bucket) bucket.push(i)
    else buckets.set(key, [i])
  })

  const raw = sites.map(site => {
    const [bx, by] = bucketOf(site.position)
    let total = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          const other = sites[j]!
          const distance = Math.hypot(
            other.position[0] - site.position[0],
            other.position[1] - site.position[1],
          )
          if (distance <= NEIGHBOURHOOD_RADIUS_METERS) total += weightOf(other)
        }
      }
    }
    return site.inSlowTerrain ? total * SLOW_TERRAIN_FACTOR : total
  })

  const sorted = [...raw].sort((a, b) => a - b)
  const reference = sorted[Math.floor(NORMALISING_PERCENTILE * (sorted.length - 1))] || 1
  return Float32Array.from(raw, value => Math.min(1, value / reference))
}
