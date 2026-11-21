import { env, exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

import { seed } from "./content"

const req = (path: string) =>
  exports.default.fetch(new Request(`https://example.com${path}`))

type Content = Record<
  string,
  { attributes: Record<string, any>; content: string; html: string }
>

describe("GET /api/content", () => {
  it("returns every seeded entry in the old api() shape", async () => {
    await seed()
    const res = await req("/api/content")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/^application\/json/)
    const data = await res.json<Content>()
    expect(Object.keys(data).sort()).toEqual([
      "about",
      "contact",
      "cv",
      "experience",
      "intro",
      "site",
    ])
    for (const entry of Object.values(data)) {
      expect(Object.keys(entry).sort()).toEqual([
        "attributes",
        "content",
        "html",
      ])
    }
    expect(data.site.attributes.name).toBe("Kate French")
    expect(data.about.html).toContain("<p>A creative thinker")
    expect(data.contact.attributes.links.resume.url).toBe("/cv")
  })

  it("sanitizes stored content before serving it", async () => {
    await seed()
    await env.DB.prepare(
      "INSERT INTO content (key, attributes, body, updated_at) VALUES (?, ?, ?, ?)",
    )
      .bind(
        "evil",
        "{}",
        '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><!-- c --><p>ok</p>',
        new Date().toISOString(),
      )
      .run()
    const data = await (await req("/api/content")).json<Content>()
    const { html } = data.evil
    expect(html).toContain("<p>ok</p>")
    for (const bad of ["<script", "onerror", "javascript:", "<!--"]) {
      expect(html).not.toContain(bad)
    }
  })

  it("returns a JSON 500 without a stack trace when the database fails", async () => {
    await env.DB.prepare("ALTER TABLE content RENAME TO content_moved").run()
    try {
      const res = await req("/api/content")
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: "could not load content" })
    } finally {
      await env.DB.prepare("ALTER TABLE content_moved RENAME TO content").run()
    }
  })
})

describe("unknown API paths", () => {
  it("return a JSON 404", async () => {
    const res = await req("/api/nope")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "not found" })
  })
})
