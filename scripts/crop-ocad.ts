import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import type { LocalExtent } from '@ratamestari/core'
import { buildTerrain, findPeripheralInformation } from '@ratamestari/engine'
import { loadOcadMap } from '@ratamestari/map-import-ocad'
import { PERIPHERAL_INFORMATION } from '@ratamestari/rules'

// Writes a small OCAD 12/2018 file cut from a larger one: the objects inside a box (clipped at
// its edges), the whole symbol set and settings, and the map's logo, copyright notice and contour
// interval moved next to the box. Personal file paths are left out.

const { values } = parseArgs({
  options: {
    map: { type: 'string' },
    box: { type: 'string' },
    out: { type: 'string' },
    name: { type: 'string', default: 'sample.ocd' },
  },
})
if (!values.map || !values.box || !values.out) {
  throw new Error('Usage: crop-ocad --map in.ocd --box minX,minY,maxX,maxY --out out.ocd')
}

const HEADER_BYTES = 60
const INDEX_ENTRIES = 256
const OBJECT_ENTRY_BYTES = 40
const STRING_ENTRY_BYTES = 16
const OBJECT_HEADER_BYTES = 56
const N_ITEM_OFFSET = 44
const COORDINATE_BYTES = 8
const LINE_OBJECT = 2
const AREA_OBJECT = 3
const FIRST_BEZIER = 1
const SECOND_BEZIER = 2
const HOLE_START = 2
const BEZIER_STEPS = 8
const PERSONAL_STRING_TYPES = new Set([12, 24])
// Beyond the mapped area's 100 m reach, and apart enough to stay separate blocks.
const MARGIN_OFFSET_METRES = 150
const MARGIN_GAP_METRES = 75

const source = readFileSync(values.map)
const map = await loadOcadMap(new Uint8Array(source))
const scale = map.info.scale
const version = source.readInt16LE(4)
if (version < 12) throw new Error(`OCAD ${version} files are not supported, only 12 and 2018`)

const toUnits = (metres: number) => Math.round((metres * 100_000) / scale)
const [boxMinX, boxMinY, boxMaxX, boxMaxY] = values.box.split(',').map(Number) as [
  number,
  number,
  number,
  number,
]
const box = {
  minX: toUnits(boxMinX),
  minY: toUnits(boxMinY),
  maxX: toUnits(boxMaxX),
  maxY: toUnits(boxMaxY),
}

interface Coordinate {
  x: number
  y: number
  xFlags: number
  yFlags: number
}

interface SourceObject {
  readonly entry: Buffer
  readonly data: Buffer
  readonly objType: number
}

function readObjects(): SourceObject[] {
  const result: SourceObject[] = []
  for (let block = source.readUInt32LE(12); block; block = source.readUInt32LE(block)) {
    for (let i = 0; i < INDEX_ENTRIES; i++) {
      const entry = source.subarray(
        block + 4 + i * OBJECT_ENTRY_BYTES,
        block + 4 + (i + 1) * OBJECT_ENTRY_BYTES,
      )
      const pos = entry.readUInt32LE(16)
      const len = entry.readUInt32LE(20)
      const status = entry.readUInt8(30)
      // ocad2geojson lists normal and hidden objects in this order, so indices match the map's.
      if (!pos || status < 1 || status > 2) continue
      result.push({ entry, data: source.subarray(pos, pos + len), objType: entry.readUInt8(28) })
    }
  }
  return result
}

function readCoordinates(data: Buffer): Coordinate[] {
  const count = data.readUInt32LE(N_ITEM_OFFSET)
  return Array.from({ length: count }, (_, i) => {
    const rawX = data.readInt32LE(OBJECT_HEADER_BYTES + i * COORDINATE_BYTES)
    const rawY = data.readInt32LE(OBJECT_HEADER_BYTES + i * COORDINATE_BYTES + 4)
    return { x: rawX >> 8, y: rawY >> 8, xFlags: rawX & 0xff, yFlags: rawY & 0xff }
  })
}

function withCoordinates(object: SourceObject, coordinates: readonly Coordinate[]) {
  const count = object.data.readUInt32LE(N_ITEM_OFFSET)
  const tail = object.data.subarray(OBJECT_HEADER_BYTES + count * COORDINATE_BYTES)
  const data = Buffer.alloc(
    OBJECT_HEADER_BYTES + coordinates.length * COORDINATE_BYTES + tail.length,
  )
  object.data.copy(data, 0, 0, OBJECT_HEADER_BYTES)
  data.writeUInt32LE(coordinates.length, N_ITEM_OFFSET)
  coordinates.forEach((c, i) => {
    data.writeInt32LE(c.x * 256 + c.xFlags, OBJECT_HEADER_BYTES + i * COORDINATE_BYTES)
    data.writeInt32LE(c.y * 256 + c.yFlags, OBJECT_HEADER_BYTES + i * COORDINATE_BYTES + 4)
  })
  tail.copy(data, OBJECT_HEADER_BYTES + coordinates.length * COORDINATE_BYTES)
  const entry = Buffer.from(object.entry)
  const xs = coordinates.map(c => c.x)
  const ys = coordinates.map(c => c.y)
  entry.writeInt32LE(Math.min(...xs) * 256, 0)
  entry.writeInt32LE(Math.min(...ys) * 256, 4)
  entry.writeInt32LE(Math.max(...xs) * 256, 8)
  entry.writeInt32LE(Math.max(...ys) * 256, 12)
  return { entry, data }
}

const isInBox = ({ x, y }: Coordinate) =>
  x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY

// A line or area can cross the box with all its points outside, so test its extent.
function isNearBox(_: Coordinate, __: number, all: readonly Coordinate[]) {
  const xs = all.map(c => c.x)
  const ys = all.map(c => c.y)
  return (
    Math.min(...xs) <= box.maxX &&
    Math.max(...xs) >= box.minX &&
    Math.min(...ys) <= box.maxY &&
    Math.max(...ys) >= box.minY
  )
}

const moved = (c: Coordinate, [dx, dy]: readonly [number, number]): Coordinate => ({
  ...c,
  x: c.x + dx,
  y: c.y + dy,
})

// The logo, copyright and contour interval go in a column just right of the box, top aligned.
function marginShifts(): Map<number, readonly [number, number]> {
  const terrain = buildTerrain(map.features(), map.info.extent)
  const annotations = map.annotations()
  const { blocks } = findPeripheralInformation(annotations, terrain, scale)
  const contourText = annotations.find(
    a => a.text !== null && PERIPHERAL_INFORMATION.contourIntervalPattern.test(a.text),
  )
  const groups: { indices: readonly number[]; extent: LocalExtent }[] = [
    ...blocks.map(block => ({ indices: block.objectIndices, extent: block.extent })),
    ...(contourText ? [{ indices: [contourText.objectIndex], extent: contourText.extent }] : []),
  ]
  const shifts = new Map<number, readonly [number, number]>()
  let top = boxMaxY
  for (const { indices, extent } of groups) {
    const [minX, , , maxY] = extent
    const shift = [toUnits(boxMaxX + MARGIN_OFFSET_METRES - minX), toUnits(top - maxY)] as const
    for (const index of indices) shifts.set(index, shift)
    top -= extent[3] - extent[1] + MARGIN_GAP_METRES
  }
  return shifts
}

function clip(objType: number, coordinates: readonly Coordinate[]): Coordinate[][] {
  if (objType === AREA_OBJECT) {
    const rings = splitRings(coordinates).map(ring => clipRing(flatten(ring)))
    const [outer, ...holes] = rings
    if (!outer || outer.length < 3) return []
    return [
      [
        ...outer,
        ...holes
          .filter(hole => hole.length >= 3)
          .flatMap(hole => hole.map((c, i) => (i === 0 ? { ...c, yFlags: HOLE_START } : c))),
      ],
    ]
  }
  if (objType === LINE_OBJECT) return clipLine(flatten(coordinates))
  return []
}

function splitRings(coordinates: readonly Coordinate[]): Coordinate[][] {
  const rings: Coordinate[][] = []
  for (const c of coordinates) {
    if (rings.length === 0 || c.yFlags & HOLE_START) rings.push([])
    rings[rings.length - 1]!.push(c)
  }
  return rings
}

// Clipped shapes are drawn with straight segments, so curves become short chords first.
function flatten(coordinates: readonly Coordinate[]): Coordinate[] {
  const result: Coordinate[] = []
  for (let i = 0; i < coordinates.length; i++) {
    const c = coordinates[i]!
    const first = coordinates[i + 1]
    const second = coordinates[i + 2]
    const end = coordinates[i + 3]
    if (first && second && end && first.xFlags & FIRST_BEZIER && second.xFlags & SECOND_BEZIER) {
      for (let step = 0; step < BEZIER_STEPS; step++) {
        const t = step / BEZIER_STEPS
        const u = 1 - t
        result.push({
          x: Math.round(
            u ** 3 * c.x + 3 * u * u * t * first.x + 3 * u * t * t * second.x + t ** 3 * end.x,
          ),
          y: Math.round(
            u ** 3 * c.y + 3 * u * u * t * first.y + 3 * u * t * t * second.y + t ** 3 * end.y,
          ),
          xFlags: 0,
          yFlags: 0,
        })
      }
      i += 2
      continue
    }
    result.push({ x: c.x, y: c.y, xFlags: 0, yFlags: 0 })
  }
  return result
}

type Edge = {
  inside: (c: Coordinate) => boolean
  cross: (a: Coordinate, b: Coordinate) => Coordinate
}

const at = (a: Coordinate, b: Coordinate, t: number): Coordinate => ({
  x: Math.round(a.x + (b.x - a.x) * t),
  y: Math.round(a.y + (b.y - a.y) * t),
  xFlags: 0,
  yFlags: 0,
})

const EDGES: Edge[] = [
  { inside: c => c.x >= box.minX, cross: (a, b) => at(a, b, (box.minX - a.x) / (b.x - a.x)) },
  { inside: c => c.x <= box.maxX, cross: (a, b) => at(a, b, (box.maxX - a.x) / (b.x - a.x)) },
  { inside: c => c.y >= box.minY, cross: (a, b) => at(a, b, (box.minY - a.y) / (b.y - a.y)) },
  { inside: c => c.y <= box.maxY, cross: (a, b) => at(a, b, (box.maxY - a.y) / (b.y - a.y)) },
]

function clipRing(ring: readonly Coordinate[]): Coordinate[] {
  let points = [...ring]
  for (const edge of EDGES) {
    const input = points
    points = []
    input.forEach((current, i) => {
      const previous = input[(i + input.length - 1) % input.length]!
      if (edge.inside(current)) {
        if (!edge.inside(previous)) points.push(edge.cross(previous, current))
        points.push(current)
      } else if (edge.inside(previous)) {
        points.push(edge.cross(previous, current))
      }
    })
    if (points.length === 0) break
  }
  return points
}

function clipLine(line: readonly Coordinate[]): Coordinate[][] {
  const pieces: Coordinate[][] = []
  let piece: Coordinate[] = []
  for (let i = 1; i < line.length; i++) {
    const segment = clipSegment(line[i - 1]!, line[i]!)
    if (!segment) {
      if (piece.length >= 2) pieces.push(piece)
      piece = []
      continue
    }
    const [from, to] = segment
    const last = piece[piece.length - 1]
    if (!last || last.x !== from.x || last.y !== from.y) {
      if (piece.length >= 2) pieces.push(piece)
      piece = [from]
    }
    piece.push(to)
  }
  if (piece.length >= 2) pieces.push(piece)
  return pieces
}

// Liang–Barsky: the part of a segment inside the box, if any.
function clipSegment(a: Coordinate, b: Coordinate): [Coordinate, Coordinate] | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  for (const [p, q] of [
    [-dx, a.x - box.minX],
    [dx, box.maxX - a.x],
    [-dy, a.y - box.minY],
    [dy, box.maxY - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return [
    t0 === 0 ? { ...a, xFlags: 0, yFlags: 0 } : at(a, b, t0),
    t1 === 1 ? { ...b, xFlags: 0, yFlags: 0 } : at(a, b, t1),
  ]
}

function writeFile(written: readonly { entry: Buffer; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []
  let offset = 0
  const append = (bytes: Buffer) => {
    const at = offset
    parts.push(bytes)
    offset += bytes.length
    return at
  }

  const header = Buffer.from(source.subarray(0, HEADER_BYTES))
  append(header)
  const fileName = Buffer.alloc(source.readUInt32LE(40))
  fileName.write(values.name!, 'latin1')
  header.writeUInt32LE(append(fileName), 36)
  header.writeUInt32LE(0, 56)

  const objectBlocks = indexBlocks(written, OBJECT_ENTRY_BYTES, (entry, item) => {
    item.entry.copy(entry)
    entry.writeUInt32LE(append(item.data), 16)
    entry.writeUInt32LE(item.data.length, 20)
  })
  header.writeUInt32LE(objectBlocks, 12)

  const strings = readStrings().filter(s => !PERSONAL_STRING_TYPES.has(s.entry.readInt32LE(8)))
  const stringBlocks = indexBlocks(strings, STRING_ENTRY_BYTES, (entry, item) => {
    item.entry.copy(entry)
    entry.writeUInt32LE(append(item.data), 0)
  })
  header.writeUInt32LE(stringBlocks, 32)

  const symbols = readSymbols()
  const symbolBlocks = indexBlocks(symbols, 4, (entry, symbol) => {
    entry.writeUInt32LE(append(symbol), 0)
  })
  header.writeUInt32LE(symbolBlocks, 8)

  return Buffer.concat(parts)

  // Blocks of 256 entries, each pointing to the next; written first so data can follow them.
  function indexBlocks<T>(
    items: readonly T[],
    entryBytes: number,
    fill: (entry: Buffer, item: T) => void,
  ): number {
    let first = 0
    let previous: Buffer | null = null
    for (let start = 0; start < items.length; start += INDEX_ENTRIES) {
      const block = Buffer.alloc(4 + INDEX_ENTRIES * entryBytes)
      const blockOffset = append(block)
      if (previous) previous.writeUInt32LE(blockOffset, 0)
      else first = blockOffset
      previous = block
      items.slice(start, start + INDEX_ENTRIES).forEach((item, i) => {
        fill(block.subarray(4 + i * entryBytes, 4 + (i + 1) * entryBytes), item)
      })
    }
    return first
  }
}

function readStrings(): { entry: Buffer; data: Buffer }[] {
  const result: { entry: Buffer; data: Buffer }[] = []
  for (let block = source.readUInt32LE(32); block; block = source.readUInt32LE(block)) {
    for (let i = 0; i < INDEX_ENTRIES; i++) {
      const entry = source.subarray(
        block + 4 + i * STRING_ENTRY_BYTES,
        block + 4 + (i + 1) * STRING_ENTRY_BYTES,
      )
      const pos = entry.readUInt32LE(0)
      const len = entry.readUInt32LE(4)
      if (entry.readInt32LE(8) <= 0 || !pos) continue
      result.push({ entry, data: source.subarray(pos, pos + len) })
    }
  }
  return result
}

function readSymbols(): Buffer[] {
  const result: Buffer[] = []
  for (let block = source.readUInt32LE(8); block; block = source.readUInt32LE(block)) {
    for (let i = 0; i < INDEX_ENTRIES; i++) {
      const pos = source.readUInt32LE(block + 4 + i * 4)
      if (pos) result.push(source.subarray(pos, pos + source.readUInt32LE(pos)))
    }
  }
  return result
}

const objects = readObjects()
const shifts = marginShifts()

const kept: { entry: Buffer; data: Buffer }[] = []
objects.forEach((object, index) => {
  const shift = shifts.get(index)
  if (shift) {
    kept.push(
      withCoordinates(
        object,
        readCoordinates(object.data).map(c => moved(c, shift)),
      ),
    )
    return
  }
  const coordinates = readCoordinates(object.data)
  if (coordinates.every(isInBox)) {
    kept.push({ entry: Buffer.from(object.entry), data: Buffer.from(object.data) })
    return
  }
  if (!coordinates.some(isNearBox)) return
  for (const clipped of clip(object.objType, coordinates)) {
    kept.push(withCoordinates(object, clipped))
  }
})

writeFileSync(values.out, writeFile(kept))
console.log(`Wrote ${values.out}: ${kept.length} of ${objects.length} objects`)
