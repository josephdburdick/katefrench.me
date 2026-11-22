import { describe, expect, it } from "vitest"

import { contentRows } from "../scripts/seed-data.ts"
import {
  type NumberItem,
  blocksFor,
  captionFor,
  formatNumber,
} from "../src/lib/numbers"
import { files } from "./content"

const attributesOf = (key: string) =>
  JSON.parse(contentRows(files).find((row) => row.key === key)!.attributes)

const items: NumberItem[] = attributesOf("numbers").items
const item = (id: string) => items.find((i) => i.id === id)!
const buttons: { text: string; number: string; phrase: string }[] =
  attributesOf("new-york").city.buttons

const captionText = (text: string) => {
  const button = buttons.find((b) => b.text === text)!
  const { lead, rest } = captionFor(item(button.number), button.phrase)
  return `${lead} ${rest}`
}

describe("blocksFor", () => {
  it("lights 10, 25 and 85 blocks for Kate's seeded numbers", () => {
    expect(blocksFor(item("replies"))).toBe(10)
    expect(blocksFor(item("meetings"))).toBe(25)
    expect(blocksFor(item("demos"))).toBe(85)
  })

  it("clamps to 0..100", () => {
    expect(blocksFor({ kind: "percent", value: 140 })).toBe(100)
    expect(blocksFor({ kind: "percent", value: -5 })).toBe(0)
    expect(blocksFor({ kind: "ratio", value: 1 })).toBe(100)
    expect(blocksFor({ kind: "ratio", value: 1000 })).toBe(0)
  })

  it("rounds", () => {
    expect(blocksFor({ kind: "ratio", value: 3 })).toBe(33)
    expect(blocksFor({ kind: "percent", value: 12.6 })).toBe(13)
  })

  it("gives 0 for a non-finite value or a ratio below 1", () => {
    expect(blocksFor({ kind: "percent", value: NaN })).toBe(0)
    expect(blocksFor({ kind: "percent", value: Infinity })).toBe(0)
    expect(blocksFor({ kind: "ratio", value: Infinity })).toBe(0)
    expect(blocksFor({ kind: "ratio", value: 0.5 })).toBe(0)
    expect(blocksFor({ kind: "ratio", value: 0 })).toBe(0)
    expect(blocksFor({ kind: "ratio", value: -4 })).toBe(0)
  })
})

describe("formatNumber", () => {
  it("formats each kind", () => {
    expect(items.map(formatNumber)).toEqual(["1 in 4", "85%", "10%", "2×"])
  })
})

describe("captionFor", () => {
  it("matches the concept's sentence for each button", () => {
    expect(captionText("Cold messages")).toBe(
      "10 of every 100 cold messages get a reply.",
    )
    expect(captionText("Sales meetings")).toBe(
      "1 in 4 sales meetings ends with a new client. That is 25 of every 100.",
    )
    expect(captionText("Demos")).toBe(
      "85 of every 100 demos go on to onboarding.",
    )
  })

  it("puts the count in the bold lead", () => {
    expect(captionFor(item("replies"), "x").lead).toBe("10 of every 100")
    expect(captionFor(item("meetings"), "x").lead).toBe("1 in 4")
  })
})
