import { describe, expect, it } from "vitest"

import { CELLS, cityLayout } from "../src/lib/block-city"

const litFor = (rank: number[], n: number) =>
  new Set(rank.flatMap((r, cell) => (r < n ? [cell] : [])))

describe("cityLayout", () => {
  it("ranks the 100 cells as a permutation of 0 to 99", () => {
    const { rank } = cityLayout()
    expect(rank).toHaveLength(CELLS)
    expect([...rank].sort((a, b) => a - b)).toEqual(
      Array.from({ length: CELLS }, (_, i) => i),
    )
  })

  it("returns the same ranks and heights on every call", () => {
    expect(cityLayout()).toEqual(cityLayout())
  })

  it("is shuffled, not in cell order", () => {
    const { rank } = cityLayout()
    expect(rank).not.toEqual(Array.from({ length: CELLS }, (_, i) => i))
  })

  it("lights exactly n cells, and a superset of every smaller count", () => {
    const { rank } = cityLayout()
    for (let n = 0; n <= CELLS; n++) {
      const lit = litFor(rank, n)
      expect(lit.size).toBe(n)
      for (let m = 0; m < n; m++) {
        for (const cell of litFor(rank, m)) expect(lit.has(cell)).toBe(true)
      }
    }
  })

  it("keeps every height between 0.9 and 1.8", () => {
    const { height } = cityLayout()
    expect(height).toHaveLength(CELLS)
    for (const h of height) {
      expect(h).toBeGreaterThanOrEqual(0.9)
      expect(h).toBeLessThanOrEqual(1.8)
    }
  })
})
