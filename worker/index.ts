import { Hono } from "hono"

import { contactApp } from "./contact"
import { content } from "./content"
import { edit, editHeaders } from "./edit"
import { editLeads } from "./edit-leads"
import { cloudflareEmail, localEmail } from "./email"
import type { Env } from "./env"
import { localTurnstile, siteverify } from "./turnstile"

const local = { email: localEmail(), turnstile: localTurnstile() }

const app = new Hono<{ Bindings: Env }>()

app.route("/api/content", content)
app.route(
  "/api/contact",
  contactApp((env) =>
    env.LOCAL_SERVICES === "1"
      ? local
      : {
          email: cloudflareEmail(env.EMAIL),
          turnstile: siteverify(env.TURNSTILE_SECRET),
        },
  ),
)

app.use("/api/edit", editHeaders)
app.use("/api/edit/", editHeaders)
edit.route("/leads", editLeads)
app.route("/api/edit/:token", edit)

app.all("/api/*", (c) => c.json({ error: "not found" }, 404))

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>
