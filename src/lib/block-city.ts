export const CELLS = 100

/**
 * The block city's fixed layout, from the concept's seeded generator (seed 7).
 * Cell `i` is lit for a count `n` exactly when `rank[i] < n`, and rises to
 * `height[i]` (0.9 to 1.8) when lit. Every call returns the same values.
 */
export function cityLayout() {
  let seed = 7
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  const order = Array.from({ length: CELLS }, (_, i) => i)
  for (let k = CELLS - 1; k > 0; k--) {
    const r = Math.floor(random() * (k + 1))
    ;[order[k], order[r]] = [order[r], order[k]]
  }

  const height = Array.from({ length: CELLS }, () => 0.9 + random() * 0.9)
  const rank: number[] = []
  order.forEach((cell, r) => (rank[cell] = r))
  return { rank, height }
}
