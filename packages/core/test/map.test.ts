import { describe, expect, it } from 'vitest'
import { localPoint, paperPoint, projectedPoint } from '../src/geometry'
import {
  localToPaper,
  localToProjected,
  paperToLocal,
  projectedToLocal,
  type Georef,
} from '../src/map'

const georef: Georef = {
  epsg: 3067,
  originInProjected: projectedPoint(507000, 6718000),
  grivationRadians: (10.2 / 180) * Math.PI,
}

describe('paper <-> local', () => {
  it('converts 1 mm of paper at 1:15000 to 15 m on the ground', () => {
    expect(paperToLocal(paperPoint(100, -200), 15000)).toEqual([15, -30])
  })

  it('round-trips', () => {
    const p = paperPoint(-7391, 7206)
    const back = localToPaper(paperToLocal(p, 15000), 15000)
    expect(back[0]).toBeCloseTo(p[0], 9)
    expect(back[1]).toBeCloseTo(p[1], 9)
  })
})

describe('local <-> projected', () => {
  it('maps the local origin to the georef origin', () => {
    expect(localToProjected(localPoint(0, 0), georef)).toEqual([507000, 6718000])
  })

  it('puts map north east of grid north when grivation is positive', () => {
    const p = localToProjected(localPoint(0, 1000), georef)
    expect(p[0]).toBeCloseTo(507000 + 1000 * Math.sin(georef.grivationRadians), 6)
    expect(p[1]).toBeCloseTo(6718000 + 1000 * Math.cos(georef.grivationRadians), 6)
  })

  it('round-trips', () => {
    const p = localPoint(-1108.65, 1080.9)
    const back = projectedToLocal(localToProjected(p, georef), georef)
    expect(back[0]).toBeCloseTo(p[0], 6)
    expect(back[1]).toBeCloseTo(p[1], 6)
  })
})
