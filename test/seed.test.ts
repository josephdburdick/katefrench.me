import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

import { assertLocalOnly } from "../scripts/seed-guard.ts"
import { draftKeys, keys, seed } from "./content"

type Row = { key: string; attributes: string; body: string; draft: number }

const rows = async () =>
  (
    await env.DB.prepare(
      "SELECT key, attributes, body, draft FROM content ORDER BY key",
    ).all<Row>()
  ).results

const attributesOf = async (key: string) => {
  const row = (await rows()).find((r) => r.key === key)
  return JSON.parse(row!.attributes)
}

describe("seed", () => {
  it("writes one row per content file", async () => {
    expect(await seed()).toBe(14)
    expect((await rows()).map((r) => r.key)).toEqual(keys)
  })

  it("moves draft: true out of the attributes into the draft column", async () => {
    await seed()
    for (const row of await rows()) {
      expect(row.draft, row.key).toBe(draftKeys.includes(row.key) ? 1 : 0)
      expect(JSON.parse(row.attributes), row.key).not.toHaveProperty("draft")
    }
  })

  it("replaces every ${basePath} with the site root", async () => {
    await seed()
    for (const row of await rows()) {
      expect(row.attributes).not.toContain("${basePath}")
      expect(row.body).not.toContain("${basePath}")
    }
    const intro = await attributesOf("intro")
    expect(intro.picture.src).toBe("/assets/images/kate-looking-up.webp")
  })

  it("keeps YAML dates as ISO strings", async () => {
    await seed()
    const experience = await attributesOf("experience")
    expect(experience.roles).toHaveLength(5)
    expect(experience.roles[0].date.start).toBe("2025-01-01T00:00:00.000Z")
  })

  it("keeps the resume sections", async () => {
    await seed()
    const cv = await attributesOf("cv")
    expect(cv.sections.map((s: { title: string }) => s.title)).toEqual([
      "About",
      "Experience",
      "Education",
      "Certifications",
      "Contact",
    ])
  })

  it("gives the same 14 rows when run twice", async () => {
    await seed()
    await seed()
    expect(await rows()).toHaveLength(14)
  })
})

describe("assertLocalOnly", () => {
  it("rejects --remote and any other argument", () => {
    expect(() => assertLocalOnly("seed:local", ["--remote"])).toThrow(
      /local only/,
    )
    expect(() => assertLocalOnly("seed:local", ["x"])).toThrow(/local only/)
  })

  it("accepts no arguments", () => {
    expect(() => assertLocalOnly("seed:local", [])).not.toThrow()
  })

  it("names the command that ran", () => {
    expect(() => assertLocalOnly("seed:local", ["--remote"])).toThrow(
      /^seed:local /,
    )
    expect(() => assertLocalOnly("edit-link:local", ["--remote"])).toThrow(
      /^edit-link:local is local only/,
    )
    expect(() => assertLocalOnly("edit-link:local", ["x"])).toThrow(
      /^edit-link:local is local only/,
    )
  })
})
