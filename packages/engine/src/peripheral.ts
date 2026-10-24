import { localExtent, localPoint, type LocalExtent, type MapAnnotation } from '@ratamestari/core'
import { PERIPHERAL_INFORMATION } from '@ratamestari/rules'
import { cellIndexOf } from './raster'
import type { Terrain } from './terrain'

export type PeripheralBlockKind = 'logo' | 'copyright'

export interface PeripheralBlock {
  readonly kind: PeripheralBlockKind
  readonly objectIndices: readonly number[]
  readonly extent: LocalExtent
  readonly widthMillimetres: number
  readonly heightMillimetres: number
}

export interface PeripheralInformation {
  readonly blocks: readonly PeripheralBlock[]
  readonly contourIntervalMetres: number | null
  // Everything in the map's margin, left out of the printed map so that only the blocks remain.
  readonly marginObjectIndices: ReadonlySet<number>
}

export interface PeripheralLayout {
  readonly widthMillimetres: number
  readonly heightMillimetres: number
  readonly blockOffsetsMillimetres: readonly (readonly [x: number, y: number])[]
  readonly scaleLineTopMillimetres: number
}

interface Group {
  readonly annotations: MapAnnotation[]
  extent: LocalExtent
}

const area = ([minX, minY, maxX, maxY]: LocalExtent) => (maxX - minX) * (maxY - minY)

const gapBetween = (a: LocalExtent, b: LocalExtent) =>
  Math.max(0, a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3])

const isInside = (inner: LocalExtent, outer: LocalExtent) =>
  inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]

const expanded = ([minX, minY, maxX, maxY]: LocalExtent, by: number) =>
  localExtent(minX - by, minY - by, maxX + by, maxY + by)

const union = (a: LocalExtent, b: LocalExtent) =>
  localExtent(
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  )

const isMapped = (terrain: Terrain, [minX, minY, maxX, maxY]: LocalExtent) => {
  const index = cellIndexOf(terrain.grid, localPoint((minX + maxX) / 2, (minY + maxY) / 2))
  return index !== null && terrain.mappedArea[index] === 1
}

// The mapped area reaches 100 m past the terrain, so parts of a logo next to the map can fall
// inside it; the group as a whole decides.
const isInMargin = (group: Group, terrain: Terrain) =>
  group.annotations.filter(annotation => !isMapped(terrain, annotation.extent)).length >=
  group.annotations.length / 2

// The map's margin (titles, logos, credits) lies outside the mapped terrain and has no ISOM
// meaning. Of it, the club's logo and copyright notice are carried onto the print.
export function findPeripheralInformation(
  annotations: readonly MapAnnotation[],
  terrain: Terrain,
  mapScale: number,
): PeripheralInformation {
  const metresPerMillimetre = mapScale / 1000
  const groupingGap = PERIPHERAL_INFORMATION.groupingGapMillimetres * metresPerMillimetre
  const marginGroups = (members: readonly MapAnnotation[]) =>
    groupNearby(members, groupingGap)
      .filter(group => isInMargin(group, terrain))
      .sort((a, b) => area(b.extent) - area(a.extent))
  const withoutMeaning = annotations.filter(annotation => !annotation.hasTerrainMeaning)
  const texts = withoutMeaning.filter(annotation => annotation.text !== null)
  const textGroups = marginGroups(texts)
  const graphicGroups = marginGroups(withoutMeaning.filter(annotation => annotation.text === null))

  const logo = graphicGroups[0]
  if (logo) {
    const captionGap = PERIPHERAL_INFORMATION.captionGapMillimetres * metresPerMillimetre
    for (const caption of texts) {
      if (gapBetween(caption.extent, logo.extent) > captionGap) continue
      logo.annotations.push(caption)
      logo.extent = union(logo.extent, caption.extent)
    }
    // Logos often borrow map symbols, such as green vegetation for leaves.
    const outline = expanded(logo.extent, captionGap)
    for (const borrowed of annotations) {
      if (borrowed.hasTerrainMeaning && isInside(borrowed.extent, outline))
        logo.annotations.push(borrowed)
    }
  }
  const copyright = textGroups.find(group =>
    PERIPHERAL_INFORMATION.copyrightPattern.test(
      group.annotations.map(annotation => annotation.text).join('\n'),
    ),
  )

  const padding = PERIPHERAL_INFORMATION.paddingMillimetres * metresPerMillimetre
  const blockOf = (kind: PeripheralBlockKind, group: Group): PeripheralBlock => {
    const [minX, minY, maxX, maxY] = group.extent
    // Text is drawn in whatever font the viewer has, often wider than the map's own.
    const textSlack = group.annotations.some(annotation => annotation.text !== null)
      ? (maxX - minX) * PERIPHERAL_INFORMATION.textSlackShare
      : 0
    const extent = localExtent(
      minX - padding,
      minY - padding,
      maxX + padding + textSlack,
      maxY + padding,
    )
    return {
      kind,
      objectIndices: group.annotations.map(annotation => annotation.objectIndex),
      extent,
      widthMillimetres: (extent[2] - extent[0]) / metresPerMillimetre,
      heightMillimetres: (extent[3] - extent[1]) / metresPerMillimetre,
    }
  }
  const blocks = [
    ...(logo ? [blockOf('logo', logo)] : []),
    ...(copyright ? [blockOf('copyright', copyright)] : []),
  ]
  const marginObjectIndices = new Set(
    [...textGroups, ...graphicGroups].flatMap(group =>
      group.annotations.map(annotation => annotation.objectIndex),
    ),
  )
  return {
    blocks,
    contourIntervalMetres: contourIntervalIn(texts),
    marginObjectIndices,
  }
}

function groupNearby(annotations: readonly MapAnnotation[], maxGap: number): Group[] {
  const groups: Group[] = []
  for (const annotation of annotations) {
    const touching = groups.filter(group => gapBetween(group.extent, annotation.extent) <= maxGap)
    const merged: Group = { annotations: [annotation], extent: annotation.extent }
    for (const group of touching) {
      merged.annotations.push(...group.annotations)
      merged.extent = union(merged.extent, group.extent)
      groups.splice(groups.indexOf(group), 1)
    }
    groups.push(merged)
  }
  return mergeUntilApart(groups, maxGap)
}

// A merged group can grow into reach of a group it did not touch before.
function mergeUntilApart(groups: Group[], maxGap: number): Group[] {
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (gapBetween(groups[i]!.extent, groups[j]!.extent) > maxGap) continue
      groups[i]!.annotations.push(...groups[j]!.annotations)
      groups[i]!.extent = union(groups[i]!.extent, groups[j]!.extent)
      groups.splice(j, 1)
      return mergeUntilApart(groups, maxGap)
    }
  }
  return groups
}

function contourIntervalIn(annotations: readonly MapAnnotation[]): number | null {
  for (const { text } of annotations) {
    const match = text && PERIPHERAL_INFORMATION.contourIntervalPattern.exec(text)
    const metres = match ? Number(match[1]!.replace(',', '.')) : Number.NaN
    if (metres > 0) return metres
  }
  return null
}

// Blocks stacked in one column with the scale line under them, all at their size on the map's
// paper so that logos and notices keep their designed size at any print scale.
export function peripheralLayout(blocks: readonly PeripheralBlock[]): PeripheralLayout {
  const { gapMillimetres, scaleLineMillimetres, scaleLineWidthMillimetres } = PERIPHERAL_INFORMATION
  const offsets: (readonly [number, number])[] = []
  let top = 0
  for (const block of blocks) {
    offsets.push([0, top])
    top += block.heightMillimetres + gapMillimetres
  }
  return {
    widthMillimetres: Math.max(
      scaleLineWidthMillimetres,
      ...blocks.map(block => block.widthMillimetres),
    ),
    heightMillimetres: top + scaleLineMillimetres,
    blockOffsetsMillimetres: offsets,
    scaleLineTopMillimetres: top,
  }
}
