import { env, exports } from "cloudflare:workers"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { EDIT_LIMITS, SECTION_KEYS } from "../src/lib/edit-content"
import { edit } from "../worker/edit"
import { replaceEditToken } from "../worker/edit-token"
import type { Env } from "../worker/env"
import { seed } from "./content"

const TOKEN = "Zq1x8dN0vYk3rTgB7mLwE5uHcA2sJf9oPiQ4yXbV6nK"
const OLD = "2000-01-01T00:00:00.000Z"

type Entry = {
  attributes: Record<string, any>
  body: string
  draft: boolean
  updatedAt: string
}
type Data = Record<string, Entry>

const req = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`https://example.com${path}`, init))

const put = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  req(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

const editPath = (rest: string, token = TOKEN) => `/api/edit/${token}${rest}`

const load = async (): Promise<Data> =>
  (await req(editPath("/content"))).json<Data>()

const publicContent = async () =>
  (await req("/api/content")).json<Record<string, any>>()

const row = (key: string) =>
  env.DB.prepare(
    "SELECT attributes, body, draft, updated_at FROM content WHERE key = ?",
  )
    .bind(key)
    .first<{
      attributes: string
      body: string
      draft: number
      updated_at: string
    }>()

const numbersBody = ({ attributes, draft }: Entry) => ({
  label: attributes.label,
  items: attributes.items.map(
    ({ id, value, label }: { id: string; value: number; label: string }) => ({
      id,
      value,
      label,
    }),
  ),
  draft,
})

const sectionBody = ({ attributes, body, draft }: Entry) => ({
  attributes,
  body,
  draft,
})

const notFoundBody = { error: "not found" }

beforeEach(async () => {
  await seed()
  await env.DB.prepare("UPDATE content SET updated_at = ?").bind(OLD).run()
  await replaceEditToken(env, TOKEN)
})

describe("the edit token", () => {
  it("lets the right token load the editable homepage sections", async () => {
    const res = await req(editPath("/content"))
    expect(res.status).toBe(200)
    const data = await res.json<Data>()
    expect(Object.keys(data)).toEqual(SECTION_KEYS)
    expect(data.numbers.attributes.items).toHaveLength(4)
    expect(data["new-york"].body).toContain("AdmitONE")
    expect(data.closing.draft).toBe(true)
    expect(data.closing.updatedAt).toBe(OLD)
  })

  it("stores only the hash", async () => {
    const stored = await env.DB.prepare(
      "SELECT token_hash FROM edit_token",
    ).all<{ token_hash: string }>()
    expect(stored.results).toHaveLength(1)
    expect(stored.results[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.results[0].token_hash).not.toContain(TOKEN)
  })

  it("stops the old token working when a new one is stored", async () => {
    await replaceEditToken(env, "a-newer-token")
    expect((await req(editPath("/content"))).status).toBe(404)
    expect((await req(editPath("/content", "a-newer-token"))).status).toBe(200)
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM edit_token",
    ).first<{ n: number }>()
    expect(count?.n).toBe(1)
  })

  const badPrefixes = [
    ["a wrong token", "/api/edit/wrong"],
    ["a token over 64 characters", `/api/edit/${"a".repeat(65)}`],
    ["the right token with a character more", `/api/edit/${TOKEN}x`],
  ]

  for (const [name, prefix] of badPrefixes) {
    it(`answers ${name} with the plain 404 on every route`, async () => {
      const data = await load()
      for (const res of [
        await req(`${prefix}/content`),
        await put(`${prefix}/numbers`, numbersBody(data.numbers)),
        await put(`${prefix}/sections/new-york`, sectionBody(data["new-york"])),
      ]) {
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual(notFoundBody)
      }
      expect((await row("numbers"))?.updated_at).toBe(OLD)
      expect((await row("new-york"))?.updated_at).toBe(OLD)
    })
  }

  it("answers a missing or empty token with the plain 404", async () => {
    for (const path of [
      "/api/edit",
      "/api/edit/",
      "/api/edit/content",
      "/api/edit//content",
      "/api/edit/numbers",
      "/api/edit/sections/new-york",
    ]) {
      for (const method of ["GET", "PUT"]) {
        const res = await req(path, {
          method,
          body: method === "PUT" ? "{}" : undefined,
        })
        expect(res.status, `${method} ${path}`).toBe(404)
        expect(await res.json()).toEqual(notFoundBody)
      }
    }
  })

  it("accepts dev-owner-token when LOCAL_SERVICES is 1", async () => {
    const res = await req("/api/edit/dev-owner-token/content")
    expect(res.status).toBe(200)
    expect(Object.keys(await res.json<Data>())).toEqual(SECTION_KEYS)
  })

  describe("in a test env", () => {
    const app = new Hono<{ Bindings: Env }>().route("/api/edit/:token", edit)
    const call = (path: string, overrides: Partial<Env>, init?: RequestInit) =>
      app.request(`https://example.com${path}`, init, {
        DB: env.DB,
        ...overrides,
      } as Env)

    it("accepts dev-owner-token with LOCAL_SERVICES set to 1", async () => {
      const res = await call("/api/edit/dev-owner-token/content", {
        LOCAL_SERVICES: "1",
      })
      expect(res.status).toBe(200)
    })

    it("rejects dev-owner-token with LOCAL_SERVICES unset or not 1", async () => {
      for (const LOCAL_SERVICES of [undefined, "", "true", "0"]) {
        const res = await call("/api/edit/dev-owner-token/content", {
          LOCAL_SERVICES,
        })
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual(notFoundBody)
        const write = await call(
          "/api/edit/dev-owner-token/sections/closing",
          { LOCAL_SERVICES },
          { method: "PUT", body: "{}" },
        )
        expect(write.status).toBe(404)
        expect(await write.json()).toEqual(notFoundBody)
      }
    })

    it("still accepts the stored token with LOCAL_SERVICES unset", async () => {
      const res = await call(editPath("/content"), {})
      expect(res.status).toBe(200)
    })
  })
})

describe("edit response headers", () => {
  const expectHeaders = (res: Response) => {
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow")
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer")
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  }

  it("are on 200s", async () => {
    const res = await req(editPath("/content"))
    expect(res.status).toBe(200)
    expectHeaders(res)
  })

  it("are on 404s, with or without a token", async () => {
    for (const path of [
      "/api/edit",
      "/api/edit/",
      "/api/edit/wrong/content",
      editPath("/nope"),
      editPath("/sections/about"),
    ]) {
      const res = await req(path)
      expect(res.status, path).toBe(404)
      expectHeaders(res)
    }
  })

  it("are on 400s", async () => {
    const res = await put(editPath("/numbers"), "not json")
    expect(res.status).toBe(400)
    expectHeaders(res)
  })

  it("are not on other API paths", async () => {
    const res = await req("/api/nope")
    expect(res.headers.get("X-Robots-Tag")).toBeNull()
  })
})

describe("PUT /numbers", () => {
  it("saves the values and labels", async () => {
    const data = await load()
    const body = numbersBody(data.numbers)
    body.items[2].value = 12
    body.items[3].value = 2.5
    body.items[0].label = "  sales meetings end with a new client "
    body.label = "Kate's numbers, December 2026"
    const res = await put(editPath("/numbers"), body)
    expect(res.status).toBe(200)
    const result = await res.json<{ ok: boolean; updatedAt: string }>()
    expect(result.ok).toBe(true)

    const { numbers } = await publicContent()
    expect(numbers.attributes.label).toBe("Kate's numbers, December 2026")
    expect(numbers.attributes.items.map((i: any) => i.value)).toEqual([
      4, 85, 12, 2.5,
    ])
    expect(numbers.attributes.items[0].label).toBe(
      "sales meetings end with a new client",
    )
    expect(numbers.attributes.items.map((i: any) => i.kind)).toEqual([
      "ratio",
      "percent",
      "percent",
      "multiple",
    ])
    const saved = await row("numbers")
    expect(saved?.updated_at).not.toBe(OLD)
    expect(saved?.updated_at).toBe(result.updatedAt)
  })

  it("saves a draft change on its own", async () => {
    const data = await load()
    const res = await put(editPath("/numbers"), {
      ...numbersBody(data.numbers),
      draft: true,
    })
    expect(res.status).toBe(200)
    expect((await publicContent()).numbers.draft).toBe(true)
    expect((await row("numbers"))?.updated_at).not.toBe(OLD)
  })

  it("accepts each kind at the ends of its range", async () => {
    const data = await load()
    const body = numbersBody(data.numbers)
    for (const [ratio, percent, multiple] of [
      [1, 0, 1],
      [100, 100, 100],
      [7, 50, 99.9],
    ]) {
      body.items[0].value = ratio
      body.items[1].value = percent
      body.items[3].value = multiple
      expect((await put(editPath("/numbers"), body)).status).toBe(200)
    }
  })

  const invalidCases: [string, (body: any) => void, string][] = [
    ["an unknown top-level key", (b) => (b.extra = 1), "extra"],
    ["a changed number id", (b) => (b.items[0].id = "other"), "items.0.id"],
    ["a missing number id", (b) => delete b.items[1].id, "items.1.id"],
    [
      "a kind sent by the client",
      (b) => (b.items[1].kind = "ratio"),
      "items.1",
    ],
    ["an added number", (b) => b.items.push({ ...b.items[0] }), "items"],
    ["a removed number", (b) => b.items.pop(), "items"],
    ["reordered numbers", (b) => b.items.reverse(), "items.0.id"],
    ["a ratio of 0", (b) => (b.items[0].value = 0), "items.0.value"],
    ["a ratio over 100", (b) => (b.items[0].value = 101), "items.0.value"],
    ["a fractional ratio", (b) => (b.items[0].value = 2.5), "items.0.value"],
    ["a percent of 150", (b) => (b.items[1].value = 150), "items.1.value"],
    ["a negative percent", (b) => (b.items[2].value = -1), "items.2.value"],
    ["a fractional percent", (b) => (b.items[2].value = 10.5), "items.2.value"],
    ["a multiple under 1", (b) => (b.items[3].value = 0.5), "items.3.value"],
    ["a multiple over 100", (b) => (b.items[3].value = 100.1), "items.3.value"],
    [
      "a multiple with two decimals",
      (b) => (b.items[3].value = 2.25),
      "items.3.value",
    ],
    ["a non-numeric value", (b) => (b.items[1].value = "85"), "items.1.value"],
    ["a null value", (b) => (b.items[1].value = null), "items.1.value"],
    [
      "a label over the limit",
      (b) => (b.items[0].label = "a".repeat(EDIT_LIMITS.numberLabel + 1)),
      "items.0.label",
    ],
    ["an empty label", (b) => (b.items[0].label = "   "), "items.0.label"],
    [
      "a section label over the limit",
      (b) => (b.label = "a".repeat(EDIT_LIMITS.text + 1)),
      "label",
    ],
    ["a draft that is not a boolean", (b) => (b.draft = "false"), "draft"],
    ["a missing draft", (b) => delete b.draft, "draft"],
  ]

  for (const [name, change, field] of invalidCases) {
    it(`rejects ${name} and writes nothing`, async () => {
      const before = await row("numbers")
      const body = numbersBody((await load()).numbers)
      change(body)
      const res = await put(editPath("/numbers"), body)
      expect(res.status).toBe(400)
      const result = await res.json<{ error: string; fields: object }>()
      expect(result.error).toBe("invalid")
      expect(Object.keys(result.fields)).toContain(field)
      expect(await row("numbers")).toEqual(before)
    })
  }

  it("rejects a body that is not a JSON object", async () => {
    for (const body of ["not json", "[]", "null", '"text"']) {
      const res = await put(editPath("/numbers"), body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "invalid" })
    }
  })

  it("rejects a body over the size cap, by actual and declared size", async () => {
    const before = await row("numbers")
    const body = numbersBody((await load()).numbers)
    const big = await put(editPath("/numbers"), {
      ...body,
      label: "a".repeat(EDIT_LIMITS.body),
    })
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ error: "too_large" })
    const declared = await put(editPath("/numbers"), body, {
      "Content-Length": String(EDIT_LIMITS.body + 1),
    })
    expect(declared.status).toBe(413)
    expect(await row("numbers")).toEqual(before)
  })

  it("answers other methods with the plain 404", async () => {
    for (const method of ["GET", "POST", "DELETE", "PATCH"]) {
      const res = await req(editPath("/numbers"), { method })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(notFoundBody)
    }
    const res = await put(editPath("/content"), {})
    expect(res.status).toBe(404)
  })
})

describe("PUT /sections/:key", () => {
  it("saves the introduction's paragraph and keeps its photo and link target", async () => {
    const data = await load()
    const body = sectionBody(data.intro)
    body.body = "I open doors in New York."
    body.attributes.heading1 = "Hi,"
    expect((await put(editPath("/sections/intro"), body)).status).toBe(200)

    const intro = (await publicContent()).intro
    expect(intro.html).toContain("I open doors in New York.")
    expect(intro.attributes.heading1).toBe("Hi,")

    for (const change of [
      (b: typeof body) => (b.attributes.link.url = "https://example.com"),
      (b: typeof body) => (b.attributes.picture.src = "/other.webp"),
    ]) {
      const locked = sectionBody((await load()).intro)
      change(locked)
      expect((await put(editPath("/sections/intro"), locked)).status).toBe(400)
    }
  })

  it("saves a section's text", async () => {
    const data = await load()
    const body = sectionBody(data["new-york"])
    body.attributes.heading = "New York, from nothing"
    body.attributes.city.buttons[0].text = "Cold emails"
    body.body = data["new-york"].body.replace(
      "I am the New York team.",
      "I am the whole New York team.",
    )
    const res = await put(editPath("/sections/new-york"), body)
    expect(res.status).toBe(200)

    const section = (await publicContent())["new-york"]
    expect(section.attributes.heading).toBe("New York, from nothing")
    expect(section.attributes.city.buttons[0].text).toBe("Cold emails")
    expect(section.content).toContain("I am the whole New York team.")
    expect(section.html).toContain("I am the whole New York team.")
    expect((await row("new-york"))?.updated_at).not.toBe(OLD)
  })

  it("saves only a draft change", async () => {
    const data = await load()
    const res = await put(editPath("/sections/closing"), {
      ...sectionBody(data.closing),
      draft: false,
    })
    expect(res.status).toBe(200)
    const closing = (await publicContent()).closing
    expect(closing.draft).toBe(false)
    expect(closing.attributes).toEqual(data.closing.attributes)
    expect((await row("closing"))?.updated_at).not.toBe(OLD)
  })

  it("saves nested text, like the message's email and the empty quote", async () => {
    const data = await load()
    const message = sectionBody(data.message)
    message.attributes.email.paragraphs[1] = "I work with AdmitONE."
    expect((await put(editPath("/sections/message"), message)).status).toBe(200)
    const firstCall = sectionBody(data["first-call"])
    firstCall.attributes.quote.text = "Kate picked up on show night."
    expect(
      (await put(editPath("/sections/first-call"), firstCall)).status,
    ).toBe(200)
    const saved = await publicContent()
    expect(saved.message.attributes.email.paragraphs[1]).toBe(
      "I work with AdmitONE.",
    )
    expect(saved["first-call"].attributes.quote.text).toBe(
      "Kate picked up on show night.",
    )
  })

  it("keeps saved Markdown sanitized on the public API", async () => {
    const body = sectionBody((await load())["new-york"])
    body.body = "<script>alert(1)</script><img src=x onerror=alert(1)>Hi"
    expect((await put(editPath("/sections/new-york"), body)).status).toBe(200)
    const { html } = (await publicContent())["new-york"]
    expect(html).not.toContain("<script")
    expect(html).not.toContain("onerror")
  })

  const invalidCases: [string, string, (body: any) => void, string][] = [
    [
      "an unknown top-level key",
      "new-york",
      (b) => (b.heading = "x"),
      "heading",
    ],
    [
      "a body over the Markdown limit",
      "new-york",
      (b) => (b.body = "a".repeat(EDIT_LIMITS.markdown + 1)),
      "body",
    ],
    ["a body that is not text", "new-york", (b) => (b.body = 1), "body"],
    ["a missing body", "new-york", (b) => delete b.body, "body"],
    [
      "an attribute string over the limit",
      "new-york",
      (b) => (b.attributes.heading = "a".repeat(EDIT_LIMITS.text + 1)),
      "attributes.heading",
    ],
    [
      "a changed button number",
      "new-york",
      (b) => (b.attributes.city.buttons[0].number = "demos"),
      "attributes.city.buttons.0.number",
    ],
    [
      "a changed photo src",
      "venues",
      (b) => (b.attributes.roles[1].photo.src = "https://evil.example/x.png"),
      "attributes.roles.1.photo.src",
    ],
    [
      "a changed closing url",
      "closing",
      (b) => (b.attributes.contact.url = "javascript:alert(1)"),
      "attributes.contact.url",
    ],
    [
      "a changed array length",
      "new-york",
      (b) => b.attributes.city.buttons.push(b.attributes.city.buttons[0]),
      "attributes.city.buttons",
    ],
    [
      "a removed list item",
      "message",
      (b) => b.attributes.email.signoff.pop(),
      "attributes.email.signoff",
    ],
    [
      "a changed photo width",
      "venues",
      (b) => (b.attributes.roles[0].photo.width = 10),
      "attributes.roles.0.photo.width",
    ],
    [
      "an added attribute key",
      "closing",
      (b) => (b.attributes.extra = "x"),
      "attributes",
    ],
    [
      "a removed attribute key",
      "closing",
      (b) => delete b.attributes.text,
      "attributes",
    ],
    [
      "a string swapped for an object",
      "closing",
      (b) => (b.attributes.text = { html: "<b>x</b>" }),
      "attributes.text",
    ],
    ["a draft that is not a boolean", "closing", (b) => (b.draft = 0), "draft"],
  ]

  for (const [name, key, change, field] of invalidCases) {
    it(`rejects ${name} and writes nothing`, async () => {
      const before = await row(key)
      const body = sectionBody((await load())[key])
      change(body)
      const res = await put(editPath(`/sections/${key}`), body)
      expect(res.status).toBe(400)
      const result = await res.json<{ error: string; fields: object }>()
      expect(result.error).toBe("invalid")
      expect(Object.keys(result.fields)).toContain(field)
      expect(await row(key)).toEqual(before)
    })
  }

  it("rejects a body over the size cap", async () => {
    const before = await row("new-york")
    const res = await put(editPath("/sections/new-york"), {
      ...sectionBody((await load())["new-york"]),
      body: "a".repeat(EDIT_LIMITS.body),
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: "too_large" })
    expect(await row("new-york")).toEqual(before)
  })

  it("answers numbers and keys outside the list with the plain 404", async () => {
    for (const key of ["numbers", "about", "cv", "site", "contact", "nope"]) {
      const before = await row(key)
      const res = await put(editPath(`/sections/${key}`), {
        body: "x",
        attributes: {},
        draft: false,
      })
      expect(res.status, key).toBe(404)
      expect(await res.json()).toEqual(notFoundBody)
      expect(await row(key)).toEqual(before)
    }
  })
})

describe("database failures", () => {
  const breakContent = () =>
    env.DB.prepare("ALTER TABLE content RENAME TO content_moved").run()
  const fixContent = () =>
    env.DB.prepare("ALTER TABLE content_moved RENAME TO content").run()

  it("answer GET with 500 load failed and PUT with 500 save failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const data = await load()
    await breakContent()
    try {
      const get = await req(editPath("/content"))
      expect(get.status).toBe(500)
      expect(await get.json()).toEqual({ error: "load failed" })
      const numbers = await put(editPath("/numbers"), numbersBody(data.numbers))
      expect(numbers.status).toBe(500)
      expect(await numbers.json()).toEqual({ error: "save failed" })
      const section = await put(
        editPath("/sections/closing"),
        sectionBody(data.closing),
      )
      expect(section.status).toBe(500)
      expect(await section.json()).toEqual({ error: "save failed" })
    } finally {
      await fixContent()
      vi.restoreAllMocks()
    }
  })

  it("never log or return the token", async () => {
    const spies = (["log", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const bodies: string[] = []
    const keep = async (res: Response) => bodies.push(await res.text())
    try {
      const data = await load()
      await keep(await req(editPath("/content")))
      await keep(await put(editPath("/numbers"), numbersBody(data.numbers)))
      await keep(
        await put(editPath("/sections/closing"), sectionBody(data.closing)),
      )
      await keep(await put(editPath("/numbers"), { bad: true }))
      await keep(await req(`/api/edit/${TOKEN}wrong/content`))
      await keep(await req(editPath("/nope")))

      await breakContent()
      try {
        await keep(await req(editPath("/content")))
        await keep(await put(editPath("/numbers"), numbersBody(data.numbers)))
        await keep(
          await put(editPath("/sections/closing"), sectionBody(data.closing)),
        )
      } finally {
        await fixContent()
      }

      await env.DB.prepare(
        "ALTER TABLE edit_token RENAME TO edit_token_moved",
      ).run()
      try {
        const res = await req(editPath("/content"))
        expect(res.status).toBe(500)
        await keep(res)
      } finally {
        await env.DB.prepare(
          "ALTER TABLE edit_token_moved RENAME TO edit_token",
        ).run()
      }

      expect(spies[2]).toHaveBeenCalled()
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN)
        expect(JSON.stringify(spy.mock.calls)).not.toContain("/api/edit")
      }
      for (const body of bodies) expect(body).not.toContain(TOKEN)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe("lists Kate can rearrange", () => {
  const save = async (key: string, change: (attributes: any) => void) => {
    const body = sectionBody((await load())[key])
    change(body.attributes)
    return put(editPath(`/sections/${key}`), body)
  }
  const stored = async (key: string) => (await publicContent())[key].attributes

  it("adds, deletes and reorders steps", async () => {
    const res = await save("first-call", ({ steps }) => {
      steps.items = [
        steps.items[2],
        steps.items[0],
        { title: "Say thanks", text: "A note after the show." },
      ]
    })
    expect(res.status).toBe(200)
    const { steps } = await stored("first-call")
    expect(steps.items.map((item: any) => item.title)).toEqual([
      "Stay close on sale day",
      "Learn their calendar",
      "Say thanks",
    ])
  })

  it("holds up to four recommendations", async () => {
    const quote = { text: "Great to work with.", name: "A", company: "B" }
    const ok = await save("marketing", (a) => {
      a.quotes = [a.quotes[0], quote, quote, quote]
      a.items[0].parts = ["One", ...a.items[0].parts]
    })
    expect(ok.status).toBe(200)
    expect((await stored("marketing")).quotes).toHaveLength(4)

    const tooMany = await save("marketing", (a) => a.quotes.push(quote))
    expect(tooMany.status).toBe(400)
    const extraField = await save("marketing", (a) => {
      a.quotes = [{ ...quote, url: "https://example.com" }]
    })
    expect(extraField.status).toBe(400)
    const none = await save("marketing", (a) => (a.items = []))
    expect(none.status).toBe(400)
  })

  it("takes any number of message notes and paragraphs, within the limits", async () => {
    const note = { lead: "Keep it short", text: "One idea per message." }
    const res = await save("message", (a) => {
      a.notes = [a.notes[1], note]
      a.email.paragraphs = [a.email.paragraphs[0], "See you at the show."]
    })
    expect(res.status).toBe(200)
    const message = await stored("message")
    expect(message.notes).toHaveLength(2)
    expect(message.notes[1]).toEqual(note)
    expect(message.email.paragraphs[1]).toBe("See you at the show.")

    expect((await save("message", (a) => (a.notes = []))).status).toBe(200)
    const tooMany = await save(
      "message",
      (a) => (a.notes = Array.from({ length: 11 }, () => note)),
    )
    expect(tooMany.status).toBe(400)
    const numbered = await save(
      "message",
      (a) => (a.notes = [{ ...note, note: 1 }]),
    )
    expect(numbered.status).toBe(400)
    const noEmail = await save("message", (a) => (a.email.paragraphs = []))
    expect(noEmail.status).toBe(400)
  })

  it("saves a subheading and accepts an empty one", async () => {
    const filled = await save(
      "marketing",
      (a) => (a.subheading = "Work I took on because it needed doing."),
    )
    expect(filled.status).toBe(200)
    expect((await stored("marketing")).subheading).toBe(
      "Work I took on because it needed doing.",
    )
    const empty = await save("marketing", (a) => (a.subheading = ""))
    expect(empty.status).toBe(200)
    expect((await stored("marketing")).subheading).toBe("")
  })

  it("moves and removes roles but keeps each photo with its role", async () => {
    const before = (await stored("venues")).roles
    const res = await save("venues", (a) => {
      a.roles = [a.roles[1], a.roles[0]]
    })
    expect(res.status).toBe(200)
    const after = (await stored("venues")).roles
    expect(after).toHaveLength(2)
    expect(after[0].photo.src).toBe(before[1].photo.src)

    const swapped = await save("venues", (a) => {
      a.roles[0].photo = { ...a.roles[0].photo, src: "/assets/other.webp" }
    })
    expect(swapped.status).toBe(400)
  })
})

describe("the resume", () => {
  type Resume = { sections: any[] }
  const loadResume = async () => (await req(editPath("/resume"))).json<Resume>()

  it("loads as text sections and dated entries", async () => {
    const { sections } = await loadResume()
    expect(sections.map((s) => s.title)).toEqual([
      "About",
      "Experience",
      "Education",
      "Certifications",
      "Contact",
    ])
    expect(sections[0].kind).toBe("text")
    expect(sections[1].entries[0]).toMatchObject({ start: 2025, end: null })
    expect(sections[2].entries[0]).toMatchObject({
      title: "Bachelor of Arts in Art History",
      place: "Virginia Commonwealth University",
      end: 2018,
      details: ["Cum Laude"],
    })
  })

  it("saves added, deleted, reordered and edited sections", async () => {
    const { sections } = await loadResume()
    const [about, experience, education] = sections
    experience.entries = [experience.entries[1], experience.entries[0]]
    experience.entries[0].title = "Product Consultant"
    const body = {
      sections: [
        experience,
        about,
        education,
        { kind: "text", title: "Languages", text: "English and Spanish." },
      ],
    }
    expect((await put(editPath("/resume"), body)).status).toBe(200)

    const { title, sections: stored } = (await publicContent()).cv.attributes
    expect(title).toBe("Resume")
    expect(stored.map((s: any) => s.title)).toEqual([
      "Experience",
      "About",
      "Education",
      "Languages",
    ])
    expect(stored[0].items[0].role).toBe("Product Consultant")
    expect(stored[0].items[0].date.end).toBeNull()
    expect(stored[2].items[0].date.end).toBe("2018-12-31T00:00:00.000Z")
    expect(stored[3].content).toBe("English and Spanish.")
    expect((await loadResume()).sections).toHaveLength(4)
  })

  it("rejects what can't be shown", async () => {
    const { sections } = await loadResume()
    const entry = (change: Record<string, unknown>) => ({
      sections: [
        {
          ...sections[1],
          entries: [{ ...sections[1].entries[0], ...change }],
        },
      ],
    })
    const cases: [unknown, string][] = [
      [{ sections: [] }, "sections"],
      [{ sections, extra: 1 }, "extra"],
      [{ sections: [{ kind: "html", title: "x", text: "x" }] }, "sections.0"],
      [{ sections: [{ ...sections[0], title: " " }] }, "sections.0.title"],
      [{ sections: [{ ...sections[0], src: "x" }] }, "sections.0"],
      [entry({ start: 1800 }), "sections.0.entries.0.start"],
      [entry({ start: 2020, end: 2019 }), "sections.0.entries.0.end"],
      [entry({ title: "" }), "sections.0.entries.0.title"],
      [entry({ details: [1] }), "sections.0.entries.0.details"],
    ]
    for (const [body, field] of cases) {
      const res = await put(editPath("/resume"), body)
      expect(res.status, field).toBe(400)
      const { fields } = await res.json<{ fields: Record<string, string> }>()
      expect(Object.keys(fields), field).toContain(field)
    }
    expect((await loadResume()).sections).toHaveLength(5)
  })

  it("needs the token", async () => {
    for (const res of [
      await req(editPath("/resume", "wrong-token")),
      await put(editPath("/resume", "wrong-token"), { sections: [] }),
    ]) {
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(notFoundBody)
    }
  })
})
