export type Point = readonly [number, number]

export interface Similarity {
  readonly apply: (point: Point) => Point
  readonly rms: number
}

// Least-squares scale, rotation and offset from one point set onto another (in order).
export function fitSimilarity(from: readonly Point[], to: readonly Point[]): Similarity {
  const mean = (points: readonly Point[]) =>
    [0, 1].map(axis => points.reduce((sum, point) => sum + point[axis]!, 0) / points.length) as [
      number,
      number,
    ]
  const [fromX, fromY] = mean(from)
  const [toX, toY] = mean(to)
  let [real, imaginary, norm] = [0, 0, 0]
  from.forEach(([x, y], i) => {
    const [px, py] = [x - fromX, y - fromY]
    const [qx, qy] = [to[i]![0] - toX, to[i]![1] - toY]
    real += qx * px + qy * py
    imaginary += qy * px - qx * py
    norm += px * px + py * py
  })
  const [a, b] = [real / norm, imaginary / norm]
  const apply = ([x, y]: Point): Point => {
    const [px, py] = [x - fromX, y - fromY]
    return [a * px - b * py + toX, b * px + a * py + toY]
  }
  const squaredErrors = from.map((point, i) => {
    const [x, y] = apply(point)
    return (x - to[i]![0]) ** 2 + (y - to[i]![1]) ** 2
  })
  return {
    apply,
    rms: Math.sqrt(squaredErrors.reduce((sum, error) => sum + error, 0) / squaredErrors.length),
  }
}
