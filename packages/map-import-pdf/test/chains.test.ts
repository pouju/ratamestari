import { paperPoint } from '@ratamestari/core'
import { describe, expect, it } from 'vitest'
import { chainDashes, chainDots } from '../src/chains'

const dash = (x: number, y: number, length: number) => ({
  points: [paperPoint(x, y), paperPoint(x + length, y)],
})

describe('chainDashes', () => {
  it('joins the dashes of each line and keeps parallel lines apart', () => {
    const upper = [0, 220, 440, 660].map(x => dash(x, 0, 200))
    const lower = [0, 220, 440].map(x => dash(x, 60, 200))
    const reversed = { points: [...upper[2]!.points].reverse() }
    const pieces = [upper[0]!, lower[0]!, upper[1]!, reversed, lower[1]!, upper[3]!, lower[2]!]

    const chains = chainDashes(pieces, 50)

    expect(chains.map(chain => [...chain.pieceIndices].sort()).sort()).toEqual([
      [0, 2, 3, 5],
      [1, 4, 6],
    ])
    const upperChain = chains.find(chain => chain.pieceIndices.includes(0))!
    const xs = upperChain.points.map(([x]) => x)
    const ascending = xs[0]! < xs[xs.length - 1]!
    expect(xs).toEqual([...xs].sort((a, b) => (ascending ? a - b : b - a)))
    expect(Math.abs(xs[0]! - xs[xs.length - 1]!)).toBe(860)
  })

  it('does not join pieces that meet at a sharp angle', () => {
    const chains = chainDashes(
      [dash(0, 0, 200), { points: [paperPoint(210, 0), paperPoint(210, 200)] }],
      50,
    )
    expect(chains).toHaveLength(2)
  })
})

describe('chainDots', () => {
  it('links evenly spaced dots into a line and leaves a lone dot alone', () => {
    const line = Array.from({ length: 10 }, (_, i) => paperPoint(i * 45, i * 10))
    const lone = paperPoint(2000, 2000)

    const chains = chainDots([...line.slice(5), lone, ...line.slice(0, 5)], 70)

    expect(chains.map(chain => chain.pieceIndices.length).sort()).toEqual([1, 10])
  })
})
