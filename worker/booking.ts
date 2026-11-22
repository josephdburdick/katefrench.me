import { Hono } from "hono"

import {
  type Answers,
  type BookingResponse,
  SENDER,
  buildEmail,
  formatCallTime,
  toAnswers,
} from "../src/lib/contact-form"
import type { LeadStatus } from "../src/lib/leads"
import { readSettings } from "./availability"
import type { ContactServices } from "./contact"
import type { Env } from "./env"
import { originAllowed } from "./origin"

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const MINUTE = 60_000
const CALL_BOOKED: LeadStatus = "call-booked"

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Stores a pending request and returns its two raw tokens, which are never stored. */
export async function insertBookingRequest(
  db: D1Database,
  request: {
    leadId: string
    answers: Answers
    start: string
    minutes: number
    now: Date
  },
): Promise<{ confirm: string; decline: string }> {
  const confirm = newToken()
  const decline = newToken()
  await db
    .prepare(
      "INSERT INTO booking_requests (id, lead_id, created_at, answers, start_at, minutes, confirm_hash, decline_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      request.leadId,
      request.now.toISOString(),
      JSON.stringify(request.answers),
      request.start,
      request.minutes,
      await hashToken(confirm),
      await hashToken(decline),
    )
    .run()
  return { confirm, decline }
}

type RequestRow = {
  id: string
  lead_id: string
  answers: string
  start_at: string
  minutes: number
  confirm_hash: string
}

async function findOpen(db: D1Database, token: string) {
  if (!TOKEN_RE.test(token)) return null
  const hash = await hashToken(token)
  const row = await db
    .prepare(
      "SELECT id, lead_id, answers, start_at, minutes, confirm_hash FROM booking_requests WHERE status = 'pending' AND (confirm_hash = ?1 OR decline_hash = ?1)",
    )
    .bind(hash)
    .first<RequestRow>()
  if (!row) return null
  return {
    row,
    action: row.confirm_hash === hash ? "confirm" : "decline",
    answers: toAnswers(JSON.parse(row.answers)),
  } as const
}

export function bookingApp(
  services: ContactServices | ((env: Env) => ContactServices),
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>()
  const headers = { "Cache-Control": "no-store" }
  const reply = (body: BookingResponse | { error: "origin" }, status = 200) =>
    Response.json(body, { status, headers })

  app.all("/:token", async (c) => {
    const request = c.req.raw
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: { ...headers, Allow: "GET, POST" },
      })
    }
    if (request.method === "POST" && !originAllowed(request)) {
      return reply({ error: "origin" }, 403)
    }

    const db = c.env.DB
    const found = await findOpen(db, c.req.param("token"))
    if (!found) return reply({ state: "used" })
    const { row, action, answers } = found
    const settings = await readSettings(db)
    const name = answers.name.trim()

    if (request.method === "GET") {
      return reply({
        state: "open",
        action,
        start: row.start_at,
        minutes: row.minutes,
        name,
        timeZone: settings.timeZone,
      })
    }

    const { calendar, email, now } =
      typeof services === "function" ? services(c.env) : services
    const claimed = await db
      .prepare(
        "UPDATE booking_requests SET status = ?, answered_at = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(
        action === "confirm" ? "confirmed" : "declined",
        (now?.() ?? new Date()).toISOString(),
        row.id,
      )
      .run()
    if (claimed.meta.changes === 0) return reply({ state: "used" })

    const when = formatCallTime(row.start_at, settings.timeZone)
    const visitor = {
      from: SENDER,
      to: answers.email.trim(),
      replyTo: { email: c.env.CONTACT_TO, name: "Kate French" },
    }
    const sendVisitor = async (subject: string, text: string) => {
      try {
        await email.send({ ...visitor, subject, text })
        return true
      } catch (error) {
        console.error(
          "booking: visitor email failed",
          (error as { code?: string })?.code ?? "unknown",
        )
        return false
      }
    }

    if (action === "decline") {
      const emailed = await sendVisitor(
        "About your call with Kate French",
        `Hi ${name},\n\nKate can't take the call you asked for on ${when}. She will reply to your message by email.`,
      )
      return reply({ state: "declined", emailed })
    }

    const revert = async () => {
      await db
        .prepare(
          "UPDATE booking_requests SET status = 'pending', answered_at = NULL WHERE id = ?",
        )
        .bind(row.id)
        .run()
      return reply({ state: "taken" })
    }

    const start = Date.parse(row.start_at)
    const end = start + row.minutes * MINUTE
    if (!calendar || start <= (now?.() ?? new Date()).getTime()) {
      return revert()
    }

    let videoLink: string
    try {
      const busy = await calendar.busy(new Date(start), new Date(end))
      const clash = busy.some(
        (interval) =>
          Date.parse(interval.start) < end && Date.parse(interval.end) > start,
      )
      if (clash) return revert()
      const event = await calendar.createEvent({
        start: row.start_at,
        end: new Date(end).toISOString(),
        summary: `Call: Kate French and ${name}`,
        description: buildEmail(answers, {
          timeZone: settings.timeZone,
          minutes: row.minutes,
        }).text,
        guest: { email: answers.email.trim(), name },
      })
      videoLink = event.videoLink
    } catch (error) {
      console.error(
        "booking: calendar failed",
        (error as { code?: string })?.code ?? "unknown",
      )
      return revert()
    }

    await db
      .prepare("UPDATE leads SET status = ? WHERE id = ?")
      .bind(CALL_BOOKED, row.lead_id)
      .run()

    const emailed = await sendVisitor(
      "Your call with Kate French is confirmed",
      `Hi ${name},\n\nKate confirmed your call on ${when}. It is ${row.minutes} minutes, by video.\n\nVideo link: ${videoLink}\n\nReply to this email if anything changes.`,
    )
    return reply({
      state: "confirmed",
      start: row.start_at,
      videoLink,
      emailed,
    })
  })

  return app
}
