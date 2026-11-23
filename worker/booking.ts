import { Hono } from "hono"

import {
  type Answers,
  BOOKING_NOTE_MAX,
  type BookingResponse,
  SENDER,
  type SuggestionResponse,
  buildEmail,
  formatCallTime,
  toAnswers,
} from "../src/lib/contact-form"
import type { LeadStatus } from "../src/lib/leads"
import {
  type BookingSettings,
  currentOpenTimes,
  readSettings,
} from "./availability"
import type { Calendar } from "./calendar"
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

type SuggestionRow = {
  id: string
  lead_id: string
  answers: string
  start_at: string
  minutes: number
  note: string
}

async function findSuggestion(db: D1Database, token: string) {
  if (!TOKEN_RE.test(token)) return null
  const row = await db
    .prepare(
      "SELECT id, lead_id, answers, start_at, minutes, note FROM booking_suggestions WHERE status = 'pending' AND token_hash = ?",
    )
    .bind(await hashToken(token))
    .first<SuggestionRow>()
  if (!row) return null
  return { row, answers: toAnswers(JSON.parse(row.answers)) }
}

/** The JSON object a booking POST carries, or `{}` for none, too much or anything else. */
async function readAction(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text()
    if (!text || text.length > 4096) return {}
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const errorCode = (error: unknown) =>
  (error as { code?: string })?.code ?? "unknown"

async function isOpen(
  db: D1Database,
  calendar: Calendar | null,
  now: Date,
  start: string,
) {
  try {
    const { times } = await currentOpenTimes(db, calendar, now)
    return times.includes(start)
  } catch (error) {
    console.error("booking: open times failed", errorCode(error))
    return false
  }
}

/** Puts the call on the calendar when the time is still ahead and free. Returns the video link, or null when it can't. */
async function bookCall(
  calendar: Calendar | null,
  now: Date,
  call: { start: string; minutes: number; answers: Answers },
  settings: BookingSettings,
): Promise<string | null> {
  const start = Date.parse(call.start)
  const end = start + call.minutes * MINUTE
  if (!calendar || start <= now.getTime()) return null
  try {
    const busy = await calendar.busy(new Date(start), new Date(end))
    const clash = busy.some(
      (interval) =>
        Date.parse(interval.start) < end && Date.parse(interval.end) > start,
    )
    if (clash) return null
    const name = call.answers.name.trim()
    const event = await calendar.createEvent({
      start: call.start,
      end: new Date(end).toISOString(),
      summary: `Call: Kate French and ${name}`,
      description: buildEmail(
        { ...call.answers, time: call.start },
        { timeZone: settings.timeZone, minutes: call.minutes },
      ).text,
      guest: { email: call.answers.email.trim(), name },
    })
    return event.videoLink
  } catch (error) {
    console.error("booking: calendar failed", errorCode(error))
    return null
  }
}

export function bookingApp(
  services: ContactServices | ((env: Env) => ContactServices),
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>()
  const headers = { "Cache-Control": "no-store" }
  const reply = (
    body: BookingResponse | SuggestionResponse | { error: "origin" },
    status = 200,
  ) => Response.json(body, { status, headers })

  /** Null when the request may go on; otherwise the response that ends it. */
  const refuse = (request: Request) => {
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: { ...headers, Allow: "GET, POST" },
      })
    }
    if (request.method === "POST" && !originAllowed(request)) {
      return reply({ error: "origin" }, 403)
    }
    return null
  }

  const visitorMail = (env: Env, email: ContactServices["email"]) => {
    return async (answers: Answers, subject: string, text: string) => {
      try {
        await email.send({
          from: SENDER,
          to: answers.email.trim(),
          replyTo: { email: env.CONTACT_TO, name: "Kate French" },
          subject,
          text,
        })
        return true
      } catch (error) {
        console.error("booking: visitor email failed", errorCode(error))
        return false
      }
    }
  }

  app.all("/time/:token", async (c) => {
    const request = c.req.raw
    const refused = refuse(request)
    if (refused) return refused

    const db = c.env.DB
    const found = await findSuggestion(db, c.req.param("token"))
    if (!found) return reply({ state: "used" })
    const { row, answers } = found
    const settings = await readSettings(db)
    const name = answers.name.trim()

    if (request.method === "GET") {
      return reply({
        state: "open",
        start: row.start_at,
        minutes: row.minutes,
        name,
        note: row.note,
        timeZone: settings.timeZone,
      })
    }

    const { calendar, email, now } =
      typeof services === "function" ? services(c.env) : services
    const at = now?.() ?? new Date()
    const body = await readAction(request)
    const pick = typeof body.pick === "string" ? body.pick : null
    if (pick && !(await isOpen(db, calendar, at, pick))) {
      return reply({ state: "taken" })
    }

    const claimed = await db
      .prepare(
        "UPDATE booking_suggestions SET status = ?, answered_at = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(pick ? "replaced" : "accepted", at.toISOString(), row.id)
      .run()
    if (claimed.meta.changes === 0) return reply({ state: "used" })

    const kateMail = async (subject: string, text: string) => {
      try {
        await email.send({
          from: SENDER,
          to: c.env.CONTACT_TO,
          replyTo: { email: answers.email.trim(), name },
          subject,
          text,
        })
        return true
      } catch (error) {
        console.error("booking: owner email failed", errorCode(error))
        return false
      }
    }

    if (pick) {
      const asked = { ...answers, time: pick }
      const tokens = await insertBookingRequest(db, {
        leadId: row.lead_id,
        answers: asked,
        start: pick,
        minutes: settings.callMinutes,
        now: at,
      })
      const origin = new URL(request.url).origin
      const message = buildEmail(
        asked,
        { timeZone: settings.timeZone, minutes: settings.callMinutes },
        {
          confirm: `${origin}/booking/${tokens.confirm}`,
          decline: `${origin}/booking/${tokens.decline}`,
        },
      )
      const emailed = await kateMail(
        `${name} picked another time`,
        message.text,
      )
      return reply({ state: "requested", start: pick, emailed })
    }

    const videoLink = await bookCall(
      calendar,
      at,
      { start: row.start_at, minutes: row.minutes, answers },
      settings,
    )
    if (!videoLink) {
      await db
        .prepare(
          "UPDATE booking_suggestions SET status = 'pending', answered_at = NULL WHERE id = ?",
        )
        .bind(row.id)
        .run()
      return reply({ state: "taken" })
    }
    await db
      .prepare("UPDATE leads SET status = ? WHERE id = ?")
      .bind(CALL_BOOKED, row.lead_id)
      .run()

    const when = formatCallTime(row.start_at, settings.timeZone)
    await kateMail(
      `${name} accepted ${when}`,
      `${name} accepted the time you suggested: ${when}. It is on your calendar.\n\nVideo link: ${videoLink}`,
    )
    const emailed = await visitorMail(c.env, email)(
      answers,
      "Your call with Kate French is confirmed",
      `Hi ${name},\n\nYour call with Kate is set for ${when}. It is ${row.minutes} minutes, by video.\n\nVideo link: ${videoLink}\n\nReply to this email if anything changes.`,
    )
    return reply({
      state: "confirmed",
      start: row.start_at,
      videoLink,
      emailed,
    })
  })

  app.all("/:token", async (c) => {
    const request = c.req.raw
    const refused = refuse(request)
    if (refused) return refused

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
    const at = now?.() ?? new Date()
    const body = await readAction(request)
    const note =
      typeof body.note === "string"
        ? body.note.trim().slice(0, BOOKING_NOTE_MAX)
        : ""
    const noteLines = note ? `\n\nA note from Kate:\n${note}` : ""
    const suggest = typeof body.suggest === "string" ? body.suggest : null
    if (suggest && !(await isOpen(db, calendar, at, suggest))) {
      return reply({ state: "taken" })
    }

    const claimed = await db
      .prepare(
        "UPDATE booking_requests SET status = ?, answered_at = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(
        !suggest && action === "confirm" ? "confirmed" : "declined",
        at.toISOString(),
        row.id,
      )
      .run()
    if (claimed.meta.changes === 0) return reply({ state: "used" })

    const when = formatCallTime(row.start_at, settings.timeZone)
    const sendVisitor = (subject: string, text: string) =>
      visitorMail(c.env, email)(answers, subject, text)

    if (suggest) {
      const token = newToken()
      await db
        .prepare(
          "INSERT INTO booking_suggestions (id, lead_id, created_at, answers, start_at, minutes, note, token_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          row.lead_id,
          at.toISOString(),
          row.answers,
          suggest,
          settings.callMinutes,
          note,
          await hashToken(token),
        )
        .run()
      const link = `${new URL(request.url).origin}/booking/time/${token}`
      const emailed = await sendVisitor(
        "Kate French suggested another time",
        `Hi ${name},\n\nKate can't make ${when}. She suggested ${formatCallTime(suggest, settings.timeZone)} instead.${noteLines}\n\nAccept it or pick another time here:\n${link}`,
      )
      return reply({ state: "suggested", start: suggest, emailed })
    }

    if (action === "decline") {
      const emailed = await sendVisitor(
        "About your call with Kate French",
        `Hi ${name},\n\nKate can't take the call you asked for on ${when}. She will reply to your message by email.${noteLines}`,
      )
      return reply({ state: "declined", emailed })
    }

    const videoLink = await bookCall(
      calendar,
      at,
      { start: row.start_at, minutes: row.minutes, answers },
      settings,
    )
    if (!videoLink) {
      await db
        .prepare(
          "UPDATE booking_requests SET status = 'pending', answered_at = NULL WHERE id = ?",
        )
        .bind(row.id)
        .run()
      return reply({ state: "taken" })
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
