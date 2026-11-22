import { Hono } from "hono"

import {
  type ContactResponse,
  LIMITS,
  SENDER,
  buildEmail,
  toAnswers,
  validateAll,
} from "../src/lib/contact-form"
import type { EmailSender } from "./email"
import type { Env } from "./env"
import type { TurnstileVerifier } from "./turnstile"

export type ContactServices = {
  email: EmailSender
  turnstile: TurnstileVerifier
}

const ORIGINS = ["https://katefrench.me", "https://www.katefrench.me"]

// Same-origin also covers local development, where the page and the Worker share a host.
function originAllowed(request: Request) {
  const origin = request.headers.get("Origin")
  if (!origin) return false
  return ORIGINS.includes(origin) || origin === new URL(request.url).origin
}

/** Pass the services, or a function that picks them from the Worker's env per request. */
export function contactApp(
  services: ContactServices | ((env: Env) => ContactServices),
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>()
  const reply = (status: 200 | 400 | 403 | 413 | 502, body: ContactResponse) =>
    Response.json(body, { status })

  app.all("/", async (c) => {
    const request = c.req.raw
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } })
    }
    if (!originAllowed(request)) {
      return reply(403, { ok: false, error: "origin" })
    }

    const declared = Number(request.headers.get("Content-Length") ?? 0)
    if (declared > LIMITS.body) {
      return reply(413, { ok: false, error: "too_large" })
    }
    const raw = await request.arrayBuffer()
    if (raw.byteLength > LIMITS.body) {
      return reply(413, { ok: false, error: "too_large" })
    }

    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(raw))
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object")
      }
      body = parsed as Record<string, unknown>
    } catch {
      return reply(400, { ok: false, error: "invalid" })
    }

    // A bot that fills the trap gets the same answer as a person, so it doesn't retry.
    if (typeof body.website === "string" && body.website.trim()) {
      return reply(200, { ok: true })
    }

    const { email, turnstile } =
      typeof services === "function" ? services(c.env) : services
    const token = typeof body.token === "string" ? body.token : ""
    const ip = request.headers.get("CF-Connecting-IP") ?? undefined
    if (!token || !(await turnstile.verify(token, ip))) {
      return reply(403, { ok: false, error: "turnstile" })
    }

    const answers = toAnswers(body.answers)
    const fields = validateAll(answers)
    if (Object.keys(fields).length > 0) {
      return reply(400, { ok: false, error: "invalid", fields })
    }

    if (!c.env.CONTACT_TO) {
      console.error("contact: CONTACT_TO is not set")
      return reply(502, { ok: false, error: "send" })
    }
    const message = buildEmail(answers)
    try {
      await email.send({
        from: SENDER,
        to: c.env.CONTACT_TO,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
      })
    } catch (error) {
      console.error(
        "contact: send failed",
        (error as { code?: string })?.code ?? "unknown",
      )
      return reply(502, { ok: false, error: "send" })
    }

    return reply(200, { ok: true })
  })

  return app
}
