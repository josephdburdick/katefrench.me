import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

import { assertLocalOnly } from "../scripts/seed-guard.ts"
import { seed } from "./content"

type Row = { key: string; attributes: string; body: string }

const rows = async () =>
  (
    await env.DB.prepare(
      "SELECT key, attributes, body FROM content ORDER BY key",
    ).all<Row>()
  ).results

const attributesOf = async (key: string) => {
  const row = (await rows()).find((r) => r.key === key)
  return JSON.parse(row!.attributes)
}

describe("seed", () => {
  it("writes one row per content file", async () => {
    expect(await seed()).toBe(6)
    expect((await rows()).map((r) => r.key)).toEqual([
      "about",
      "contact",
      "cv",
      "experience",
      "intro",
      "site",
    ])
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

  it("gives the same six rows when run twice", async () => {
    await seed()
    await seed()
    expect(await rows()).toHaveLength(6)
  })
})

describe("assertLocalOnly", () => {
  it("rejects --remote and any other argument", () => {
    expect(() => assertLocalOnly(["--remote"])).toThrow(/local only/)
    expect(() => assertLocalOnly(["x"])).toThrow(/local only/)
  })

  it("accepts no arguments", () => {
    expect(() => assertLocalOnly([])).not.toThrow()
  })
})
