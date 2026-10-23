export interface Random {
  next(): number
  between(min: number, max: number): number
  pick<T>(items: readonly T[]): T | undefined
}

export function seededRandom(seed: number): Random {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    between: (min, max) => min + (max - min) * next(),
    pick: items => (items.length === 0 ? undefined : items[Math.floor(next() * items.length)]),
  }
}
