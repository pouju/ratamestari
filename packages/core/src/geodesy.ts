import type { ProjectedPoint } from './geometry'

export interface GeographicPoint {
  readonly longitudeDegrees: number
  readonly latitudeDegrees: number
}

interface TransverseMercator {
  readonly semiMajorAxis: number
  readonly flattening: number
  readonly centralMeridianDegrees: number
  readonly scaleFactor: number
  readonly falseEasting: number
  readonly falseNorthing: number
}

const GRS80 = { semiMajorAxis: 6378137, flattening: 1 / 298.257222101 }
const WGS84 = { semiMajorAxis: 6378137, flattening: 1 / 298.257223563 }
const UTM = { scaleFactor: 0.9996, falseEasting: 500000 }
const SOUTHERN_FALSE_NORTHING = 10000000

const utmZone = (
  zone: number,
  ellipsoid: typeof GRS80,
  isSouthern = false,
): TransverseMercator => ({
  ...ellipsoid,
  ...UTM,
  centralMeridianDegrees: zone * 6 - 183,
  falseNorthing: isSouthern ? SOUTHERN_FALSE_NORTHING : 0,
})

const ETRS_TM35FIN = 3067
const ETRS89_UTM_ZONE_28N = 25828
const ETRS89_UTM_ZONES = { first: 28, last: 38 }
const WGS84_UTM_NORTH = 32600
const WGS84_UTM_SOUTH = 32700
const UTM_ZONES = 60

function projectionFor(epsg: number): TransverseMercator | null {
  if (epsg === ETRS_TM35FIN) return utmZone(35, GRS80)
  const etrsZone = epsg - ETRS89_UTM_ZONE_28N + ETRS89_UTM_ZONES.first
  if (etrsZone >= ETRS89_UTM_ZONES.first && etrsZone <= ETRS89_UTM_ZONES.last) {
    return utmZone(etrsZone, GRS80)
  }
  if (epsg > WGS84_UTM_NORTH && epsg <= WGS84_UTM_NORTH + UTM_ZONES) {
    return utmZone(epsg - WGS84_UTM_NORTH, WGS84)
  }
  if (epsg > WGS84_UTM_SOUTH && epsg <= WGS84_UTM_SOUTH + UTM_ZONES) {
    return utmZone(epsg - WGS84_UTM_SOUTH, WGS84, true)
  }
  return null
}

export function geographicToProjected(point: GeographicPoint, epsg: number): ProjectedPoint | null {
  const projection = projectionFor(epsg)
  return projection && transverseMercator(point, projection)
}

// A projected system for a place that has none of its own: ETRS-TM35FIN in Finland, as Finnish
// maps use, otherwise the WGS 84 UTM zone.
const FINLAND = { west: 19, east: 32, south: 59, north: 71 }

export function projectedSystemFor({ longitudeDegrees, latitudeDegrees }: GeographicPoint): number {
  const inFinland =
    longitudeDegrees >= FINLAND.west &&
    longitudeDegrees <= FINLAND.east &&
    latitudeDegrees >= FINLAND.south &&
    latitudeDegrees <= FINLAND.north
  if (inFinland) return ETRS_TM35FIN
  const zone = Math.min(UTM_ZONES, Math.floor((longitudeDegrees + 180) / 6) + 1)
  return (latitudeDegrees >= 0 ? WGS84_UTM_NORTH : WGS84_UTM_SOUTH) + zone
}

export function projectedToGeographic(point: ProjectedPoint, epsg: number): GeographicPoint | null {
  const projection = projectionFor(epsg)
  return projection && inverseTransverseMercator(point, projection)
}

// Krüger series to third order, accurate to well under a millimetre within a UTM zone.
function transverseMercator(
  { longitudeDegrees, latitudeDegrees }: GeographicPoint,
  p: TransverseMercator,
): ProjectedPoint {
  const n = p.flattening / (2 - p.flattening)
  const rectifyingRadius = (p.semiMajorAxis / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64)
  const alpha = [
    n / 2 - (2 * n ** 2) / 3 + (5 * n ** 3) / 16,
    (13 * n ** 2) / 48 - (3 * n ** 3) / 5,
    (61 * n ** 3) / 240,
  ]
  const latitude = (latitudeDegrees * Math.PI) / 180
  const longitude = ((longitudeDegrees - p.centralMeridianDegrees) * Math.PI) / 180
  const eccentricityTerm = (2 * Math.sqrt(n)) / (1 + n)
  const t = Math.sinh(
    Math.atanh(Math.sin(latitude)) -
      eccentricityTerm * Math.atanh(eccentricityTerm * Math.sin(latitude)),
  )
  const xiPrime = Math.atan2(t, Math.cos(longitude))
  const etaPrime = Math.atanh(Math.sin(longitude) / Math.sqrt(1 + t * t))
  let xi = xiPrime
  let eta = etaPrime
  alpha.forEach((a, i) => {
    const k = 2 * (i + 1)
    xi += a * Math.sin(k * xiPrime) * Math.cosh(k * etaPrime)
    eta += a * Math.cos(k * xiPrime) * Math.sinh(k * etaPrime)
  })
  return [
    p.falseEasting + p.scaleFactor * rectifyingRadius * eta,
    p.falseNorthing + p.scaleFactor * rectifyingRadius * xi,
  ] as const as ProjectedPoint
}

function inverseTransverseMercator(
  [easting, northing]: ProjectedPoint,
  p: TransverseMercator,
): GeographicPoint {
  const n = p.flattening / (2 - p.flattening)
  const rectifyingRadius = (p.semiMajorAxis / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64)
  const beta = [
    n / 2 - (2 * n ** 2) / 3 + (37 * n ** 3) / 96,
    n ** 2 / 48 + n ** 3 / 15,
    (17 * n ** 3) / 480,
  ]
  const delta = [
    2 * n - (2 * n ** 2) / 3 - 2 * n ** 3,
    (7 * n ** 2) / 3 - (8 * n ** 3) / 5,
    (56 * n ** 3) / 15,
  ]

  const xi = (northing - p.falseNorthing) / (p.scaleFactor * rectifyingRadius)
  const eta = (easting - p.falseEasting) / (p.scaleFactor * rectifyingRadius)
  let xiPrime = xi
  let etaPrime = eta
  beta.forEach((b, i) => {
    const k = 2 * (i + 1)
    xiPrime -= b * Math.sin(k * xi) * Math.cosh(k * eta)
    etaPrime -= b * Math.cos(k * xi) * Math.sinh(k * eta)
  })
  const conformalLatitude = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime))
  let latitude = conformalLatitude
  delta.forEach((d, i) => {
    latitude += d * Math.sin(2 * (i + 1) * conformalLatitude)
  })
  const longitude =
    (p.centralMeridianDegrees * Math.PI) / 180 + Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime))
  return {
    longitudeDegrees: (longitude * 180) / Math.PI,
    latitudeDegrees: (latitude * 180) / Math.PI,
  }
}
