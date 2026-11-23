import { Hono } from "hono"

import { availabilityApp } from "./availability"
import { bookingApp } from "./booking"
import { contactApp } from "./contact"
import { content } from "./content"
import { edit, editHeaders } from "./edit"
import { editLeads } from "./edit-leads"
import { editResume } from "./edit-resume"
import type { Env } from "./env"
import { rateLimit } from "./rate-limit"
import { servicesFor } from "./services"

const app = new Hono<{ Bindings: Env }>()

app.use("/api/*", rateLimit)

app.route("/api/content", content)
app.route("/api/contact", contactApp(servicesFor))
app.route("/api/availability", availabilityApp(servicesFor))
app.route("/api/booking", bookingApp(servicesFor))

app.use("/api/edit", editHeaders)
app.use("/api/edit/", editHeaders)
edit.route("/leads", editLeads)
edit.route("/resume", editResume)
app.route("/api/edit/:token", edit)

app.all("/api/*", (c) => c.json({ error: "not found" }, 404))

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>
