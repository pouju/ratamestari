import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DOMImplementation } from 'xmldom'
import readOcad from 'ocad2geojson/src/ocad-reader'
import { Buffer } from 'buffer'
import { describe, expect, it } from 'vitest'
import { localToProjected, paperPoint, paperToLocal } from '@ratamestari/core'
import { loadOcadMap } from '../src/load'

const localMapPath = fileURLToPath(new URL('../../../maps/example.ocd', import.meta.url))
const localMapExists = existsSync(localMapPath)

describe.skipIf(!localMapExists)('loadOcadMap with git-ignored maps/example.ocd', () => {
  const bytes = localMapExists ? new Uint8Array(readFileSync(localMapPath)) : new Uint8Array()

  it('reads scale, extent and georeference', async () => {
    const map = await loadOcadMap(bytes)
    expect(map.info.scale).toBe(15000)
    expect(map.info.georef?.epsg).toBe(3067)
    expect(map.objectCount).toBeGreaterThan(10000)
    const [minX, minY, maxX, maxY] = map.info.extent
    expect(maxX - minX).toBeGreaterThan(3000)
    expect(maxY - minY).toBeGreaterThan(4000)
  })

  it('projects local points the same way as ocad2geojson', async () => {
    const map = await loadOcadMap(bytes)
    const reference = await readOcad(Buffer.from(bytes), { quietWarnings: true })
    const referenceCrs = reference.getCrs()
    const georef = map.info.georef!
    for (const [x, y] of [
      [0, 0],
      [-8418, -16672],
      [15668, 15005],
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
