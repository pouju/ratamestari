import { describe, expect, it } from 'vitest'
import { describeControl } from '../src/describe-control'
import { descriptionText } from '../src/description-text'
import { NORTH_WEST, site } from './fixtures'

const textOf = (...args: Parameters<typeof site>) => {
  const description = describeControl(site(...args))
  return description && descriptionText(description)
}

describe('describeControl', () => {
  it('describes a point feature by its IOF feature alone', () => {
    expect(textOf({ isomCode: '205' })).toBe('Boulder')
  })

  it('adds the appearance the IOF symbol table asks for', () => {
    expect(textOf({ isomCode: '514', placement: 'lineCentre' })).toBe('Wall, ruined')
  })

  it('names the end of a line feature by the way it points', () => {
    expect(
      textOf({
        isomCode: '505',
        placement: 'lineEnd',
        orientation: { kind: 'end', pointingRadians: NORTH_WEST },
      }),
    ).toBe('Path, north-west end')
  })

  it('puts the flag inside a convex corner of open land and outside one of a thicket', () => {
    const corner = { kind: 'corner', pointingRadians: 0, turnDegrees: 90, isConvex: true } as const
    expect(textOf({ isomCode: '401', placement: 'areaCorner', orientation: corner })).toBe(
      'Open land, east corner (inside)',
    )
    expect(textOf({ isomCode: '408', placement: 'areaCorner', orientation: corner })).toBe(
      'Thicket, east corner (outside)',
    )
  })

  it('calls a concave corner of open land a forest corner', () => {
    expect(
      textOf({
        isomCode: '401',
        placement: 'areaCorner',
        orientation: { kind: 'corner', pointingRadians: 0, turnDegrees: 90, isConvex: false },
      }),
    ).toBe('Forest corner')
  })

  it('calls a sharp corner a tip', () => {
    expect(
      textOf({
        isomCode: '308',
        placement: 'areaCorner',
        orientation: {
          kind: 'corner',
          pointingRadians: -Math.PI / 2,
          turnDegrees: 150,
          isConvex: true,
        },
      }),
    ).toBe('Marsh, south tip')
  })

  it('describes contour features from their form', () => {
    expect(textOf({ isomCode: '101', placement: 'contourKnoll', contourForm: 'knoll' })).toBe(
      'Hill',
    )
    expect(textOf({ isomCode: '101', placement: 'contourBend', contourForm: 'reEntrant' })).toBe(
      'Re-entrant',
    )
  })

  it('cannot describe a contour feature whose up and down sides are unknown', () => {
    expect(describeControl(site({ isomCode: '101', placement: 'contourBend' }))).toBeNull()
  })

  it('picks the boulder out from a similar one with column C', () => {
    expect(textOf({ similarFeatureOffsets: [[-15, -10]] })).toBe('North-eastern boulder')
  })

  it('ignores similar features near the circle edge (RMK 5.2.ST)', () => {
    expect(textOf({ similarFeatureOffsets: [[30, 10]] })).toBe('Boulder')
  })

  it('rejects a site that column C cannot single out', () => {
    expect(
      describeControl(
        site({
          similarFeatureOffsets: [
            [-15, 0],
            [15, 0],
            [0, 15],
            [0, -15],
          ],
        }),
      ),
    ).toBeNull()
  })

  it('says which side of the feature the flag is on', () => {
    const side = (location: 'side' | 'edge' | 'directionalFoot', directionRadians: number) => ({
      location,
      directionRadians,
      isHiddenFromApproach: true,
    })
    const text = (overrides: Parameters<typeof site>[0], flagSide: ReturnType<typeof side>) =>
      descriptionText(describeControl(site(overrides), flagSide)!)
    expect(text({}, side('side', 0))).toBe('Boulder, east side')
    expect(text({ isomCode: '112' }, side('edge', Math.PI))).toBe('Pit, west edge')
    expect(
      text(
        { isomCode: '101', placement: 'contourKnoll', contourForm: 'knoll' },
        side('directionalFoot', Math.PI / 4),
      ),
    ).toBe('Hill, north-east foot')
  })
})
