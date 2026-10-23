import { DOMImplementation } from 'xmldom'
import readOcad from 'ocad2geojson/src/ocad-reader'
import { Buffer } from 'buffer'
import { describe, expect, it } from 'vitest'
import { localToProjected, paperPoint, paperToLocal } from '@ratamestari/core'
import { loadOcadMap } from '../src/load'
import { localMapExists, readLocalMap } from './local-map'

describe.skipIf(!localMapExists)('loadOcadMap with a local map from git-ignored maps/', () => {
  const bytes = localMapExists ? readLocalMap() : new Uint8Array()

  it('reads scale, extent and objects', async () => {
    const map = await loadOcadMap(bytes)
    expect(map.info.scale).toBeGreaterThan(0)
    expect(map.objectCount).toBeGreaterThan(0)
    const [minX, minY, maxX, maxY] = map.info.extent
    expect(maxX).toBeGreaterThan(minX)
    expect(maxY).toBeGreaterThan(minY)
  })

  it('projects local points the same way as ocad2geojson', async () => {
    const map = await loadOcadMap(bytes)
    const georef = map.info.georef
    if (!georef) return
    const reference = await readOcad(Buffer.from(bytes), { quietWarnings: true })
    const referenceCrs = reference.getCrs()
    const [minX, minY, maxX, maxY] = reference.getBounds()
    for (const [x, y] of [
      [0, 0],
      [minX, minY],
      [maxX, maxY],
    ] as const) {
      const ours = localToProjected(paperToLocal(paperPoint(x, y), map.info.scale), georef)
      const theirs = referenceCrs.toProjectedCoord([x, y])
      expect(ours[0]).toBeCloseTo(theirs[0]!, 6)
      expect(ours[1]).toBeCloseTo(theirs[1]!, 6)
    }
  })

  it('renders SVG', async () => {
    const map = await loadOcadMap(bytes)
    const doc = new DOMImplementation().createDocument(null, 'svg', null) as unknown as Document
    const svg = map.renderSvg(doc)
    expect(svg.getAttribute('viewBox')).toBeTruthy()
    expect(svg.childNodes.length).toBeGreaterThan(1)
  })
})
