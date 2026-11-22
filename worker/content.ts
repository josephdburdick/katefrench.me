import { Hono } from "hono"
import { marked } from "marked"

import { sanitizeHtml } from "../src/lib/sanitize-html"
import type { Env } from "./env"

type ContentRow = {
  key: string
  attributes: string
  body: string
  draft: number
}

export const content = new Hono<{ Bindings: Env }>()

content.get("/", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT key, attributes, body, draft FROM content",
    ).all<ContentRow>()
    const data: Record<
      string,
      { attributes: unknown; content: string; html: string; draft: boolean }
    > = {}
    for (const row of results) {
      data[row.key] = {
        attributes: JSON.parse(row.attributes),
        content: row.body,
        html: sanitizeHtml(await marked.parse(row.body)),
        draft: row.draft === 1,
      }
    }
    return c.json(data)
  } catch (err) {
    console.error("GET /api/content failed", err)
    return c.json({ error: "could not load content" }, 500)
  }
})
