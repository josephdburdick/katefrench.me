import { Hono } from "hono"

import {
  type CallDetails,
  type ContactResponse,
  LIMITS,
  SENDER,
  TIME_TAKEN,
  buildEmail,
  hasCallTime,
  isSource,
  toAnswers,
  validateAll,
} from "../src/lib/contact-form"
import { currentOpenTimes } from "./availability"
import { insertBookingRequest } from "./booking"
import type { Calendar } from "./calendar"
import type { EmailSender } from "./email"
import type { Env } from "./env"
import { insertLead } from "./leads"
import { originAllowed } from "./origin"
import type { TurnstileVerifier } from "./turnstile"

export type ContactServices = {
  email: EmailSender
  turnstile: TurnstileVerifier
  /** Null until a real calendar exists, so only "No call" is offered. */
  calendar: Calendar | null
  /** Defaults to the real time; tests inject a clock. */
  now?: () => Date
}

const errorCode = (error: unknown) =>
  (error as { code?: string })?.code ?? "unknown"

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

    const { email, turnstile, calendar, now } =
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

    const at = now?.() ?? new Date()
    let call: CallDetails | undefined
    if (hasCallTime(answers)) {
      try {
        const { settings, times } = await currentOpenTimes(
          c.env.DB,
          calendar,
          at,
        )
        if (times.includes(answers.time)) {
          call = { timeZone: settings.timeZone, minutes: settings.callMinutes }
        }
      } catch (error) {
        console.error("contact: open times failed", errorCode(error))
      }
      if (!call) {
        return reply(400, {
          ok: false,
          error: "invalid",
          fields: { time: TIME_TAKEN },
        })
      }
    }

    const from = isSource(body.from) ? body.from : null
    // The email still goes out when an insert fails: Kate hearing about it matters more than the row.
    let links: { confirm: string; decline: string } | undefined
    try {
      const leadId = await insertLead(c.env.DB, answers, from)
      if (call) {
        try {
          const tokens = await insertBookingRequest(c.env.DB, {
            leadId,
            answers,
            start: answers.time,
            minutes: call.minutes,
            now: at,
          })
          const origin = new URL(request.url).origin
          links = {
            confirm: `${origin}/booking/${tokens.confirm}`,
            decline: `${origin}/booking/${tokens.decline}`,
          }
        } catch (error) {
          console.error(
            "contact: booking request insert failed",
            errorCode(error),
          )
        }
      }
    } catch (error) {
      console.error("contact: lead insert failed", errorCode(error))
    }

    if (!c.env.CONTACT_TO) {
      console.error("contact: CONTACT_TO is not set")
      return reply(502, { ok: false, error: "send" })
    }
    const message = buildEmail(answers, call, links)
    try {
      await email.send({
        from: SENDER,
        to: c.env.CONTACT_TO,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
      })
    } catch (error) {
      console.error("contact: send failed", errorCode(error))
      return reply(502, { ok: false, error: "send" })
    }

    return reply(200, { ok: true })
  })

  return app
}
