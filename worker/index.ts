import { Hono } from "hono"

import { content } from "./content"
import type { Env } from "./env"

const app = new Hono<{ Bindings: Env }>()

app.route("/api/content", content)

app.all("/api/*", (c) => c.json({ error: "not found" }, 404))

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>
