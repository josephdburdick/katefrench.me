import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

const put = (key: string, attributes: unknown) =>
  env.DB.prepare(
    "INSERT OR REPLACE INTO content (key, attributes, body, draft, updated_at) VALUES (?, ?, '', 0, '2026-11-27T00:00:00.000Z')",
  )
    .bind(key, JSON.stringify(attributes))
    .run()

const attributesOf = async (key: string) =>
  JSON.parse(
    (await env.DB.prepare("SELECT attributes FROM content WHERE key = ?")
      .bind(key)
      .first<{ attributes: string }>())!.attributes,
  )

const migrate = async () => {
  const { queries } = env.TEST_MIGRATIONS.find((m) =>
    m.name.startsWith("0008_"),
  )!
  for (const query of queries) await env.DB.prepare(query).run()
}

describe("migration 0008", () => {
  it("reshapes content saved in the old shape and keeps its wording", async () => {
    const notes = [
      { lead: "Make it personal", text: "Name a detail." },
      { lead: "", text: "" },
    ]
    await put("new-york", {
      heading: "New York, from zero",
      city: { label: "Choose", buttons: [], key: "Each block is one." },
      cta: { text: "Tell me about the role.", draft: true },
    })
    await put("message", {
      heading: "The message that worked",
      email: {
        greeting: "Hi there,",
        greetingNote: 1,
        paragraphs: [
          [{ text: "I saw your events.", note: 2 }],
          [
            { text: "I work with AdmitONE.", note: 3 },
            { text: "Our fees are lower.", note: 4 },
          ],
        ],
        signoff: ["Best,", "Kate"],
      },
      notes,
      cta: { text: "Let's talk.", draft: true },
    })
    await put("first-call", {
      steps: { heading: "Beyond the sale", items: [{ title: "a", text: "b" }] },
      quote: { text: "", name: "", venue: "" },
    })
    await put("marketing", { heading: "Outside my job", items: [], quotes: [] })
    await put("venues", { heading: "Why venues pick up", roles: [] })

    await migrate()
    await migrate()

    const newYork = await attributesOf("new-york")
    expect(Object.keys(newYork)).toEqual([
      "heading",
      "subheading",
      "city",
      "cta",
    ])
    expect(newYork.city).toEqual({ label: "Choose", buttons: [] })
    expect(newYork.cta).toEqual({
      text: "Tell me about the role.",
      draft: true,
    })

    const message = await attributesOf("message")
    expect(message.subheading).toBe("")
    expect(message.email).toEqual({
      greeting: "Hi there,",
      paragraphs: [
        "I saw your events.",
        "I work with AdmitONE. Our fees are lower.",
      ],
      signoff: ["Best,", "Kate"],
    })
    expect(message.notes).toEqual(notes)

    expect((await attributesOf("first-call")).steps).toEqual({
      heading: "Beyond the sale",
      subheading: "",
      items: [{ title: "a", text: "b" }],
    })
    expect(await attributesOf("marketing")).toEqual({
      heading: "Outside my job",
      subheading: "",
      items: [],
      quotes: [],
    })
  })

  it("keeps a subheading that is already there", async () => {
    await put("venues", {
      heading: "Why venues pick up",
      subheading: "Five jobs that taught me their side.",
      roles: [],
    })
    await migrate()
    expect((await attributesOf("venues")).subheading).toBe(
      "Five jobs that taught me their side.",
    )
  })
})
