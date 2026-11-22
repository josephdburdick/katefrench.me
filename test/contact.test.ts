import { exports, env as workerEnv } from "cloudflare:workers"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LIMITS, NO_CALL, SENDER, TIME_TAKEN } from "../src/lib/contact-form"
import { hashToken } from "../worker/booking"
import { type Calendar, localCalendar } from "../worker/calendar"
import { type ContactServices, contactApp } from "../worker/contact"
import {
  type EmailMessage,
  type EmailSender,
  cloudflareEmail,
  localEmail,
} from "../worker/email"
import type { Env } from "../worker/env"
import { DUMMY_TOKEN, localTurnstile, siteverify } from "../worker/turnstile"

const URL = "https://katefrench.me/api/contact"
const env = { CONTACT_TO: "kate@example.com", DB: workerEnv.DB } as Env

type Lead = {
  id: string
  created_at: string
  intent: string
  answers: string
  name: string
  email: string
  company: string | null
  from_section: string | null
  status: string
}

const leads = async () =>
  (await workerEnv.DB.prepare("SELECT * FROM leads").all<Lead>()).results

const answers = {
  intent: "hiring",
  details: { role: "Sales", location: "New York", start: "Right away" },
  message: "We need someone to open New York.",
  name: "Sam Lee",
  email: "sam@example.com",
  company: "Acme",
}

const valid = { answers, token: DUMMY_TOKEN, website: "" }

// Monday 9:00 in New York, so the first open time is Tuesday 9:00.
const NOW = new Date("2026-11-23T14:00:00.000Z")
const OFFERED = "2026-11-24T14:00:00.000Z"

function setup(
  email: EmailSender = localEmail(),
  overrides: Partial<Env> = {},
  services: Partial<ContactServices> = {},
) {
  const turnstile = localTurnstile()
  const verify = vi.spyOn(turnstile, "verify")
  const app = new Hono<{ Bindings: Env }>().route(
    "/api/contact",
    contactApp({
      email,
      turnstile,
      calendar: localCalendar(),
      now: () => NOW,
      ...services,
    }),
  )
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      URL,
      {
        method: "POST",
        headers: {
          Origin: "https://katefrench.me",
          "Content-Type": "application/json",
          ...headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
      { ...env, ...overrides },
    )
  return { app, post, verify }
}

describe("POST /api/contact", () => {
  beforeEach(async () => {
    await workerEnv.DB.prepare("DELETE FROM booking_requests").run()
    await workerEnv.DB.prepare("DELETE FROM leads").run()
  })

  it("answers anything but POST with 405", async () => {
    const { app } = setup()
    const res = await app.request(URL, {}, env)
    expect(res.status).toBe(405)
    expect(res.headers.get("Allow")).toBe("POST")
  })

  it("refuses a foreign or missing Origin", async () => {
    const email = localEmail()
    const { app, post } = setup(email)
    const evil = await post(valid, { Origin: "https://evil.example" })
    expect(evil.status).toBe(403)
    expect(await evil.json()).toEqual({ ok: false, error: "origin" })

    const none = await app.request(
      URL,
      { method: "POST", body: JSON.stringify(valid) },
      env,
    )
    expect(none.status).toBe(403)
    expect(await none.json()).toEqual({ ok: false, error: "origin" })
    expect(email.sent).toEqual([])
  })

  it("accepts the www host and the request's own origin", async () => {
    const { post } = setup()
    expect(
      (await post(valid, { Origin: "https://www.katefrench.me" })).status,
    ).toBe(200)
    const { app } = setup()
    const res = await app.request(
      "http://localhost:5120/api/contact",
      {
        method: "POST",
        headers: { Origin: "http://localhost:5120" },
        body: JSON.stringify(valid),
      },
      env,
    )
    expect(res.status).toBe(200)
  })

  it("refuses a body over the limit, by declared and actual size", async () => {
    const email = localEmail()
    const { post } = setup(email)
    const big = await post({ ...valid, padding: "a".repeat(LIMITS.body) })
    expect(big.status).toBe(413)
    expect(await big.json()).toEqual({ ok: false, error: "too_large" })

    const declared = await post(valid, {
      "Content-Length": String(LIMITS.body + 1),
    })
    expect(declared.status).toBe(413)
    expect(email.sent).toEqual([])
  })

  it("fits every field at its limit in 4-byte characters", async () => {
    const wide = (n: number) => "😀".repeat(n / 2)
    const { post } = setup()
    const res = await post({
      answers: {
        ...answers,
        message: wide(LIMITS.message),
        name: wide(LIMITS.name),
        company: wide(LIMITS.company),
      },
      token: "x".repeat(2048),
      website: "",
    })
    expect(res.status).not.toBe(413)
  })

  it("refuses a body that is not a JSON object", async () => {
    const { post } = setup()
    for (const body of ["not json", "[]", "null", '"text"']) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false, error: "invalid" })
    }
  })

  it("answers a filled trap field with ok and sends nothing", async () => {
    const email = localEmail()
    const { post, verify } = setup(email)
    const res = await post({ ...valid, website: "https://spam.example" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(email.sent).toEqual([])
    expect(verify).not.toHaveBeenCalled()
  })

  it("refuses a missing or wrong Turnstile token", async () => {
    const email = localEmail()
    const { post } = setup(email)
    for (const token of [undefined, "", "wrong-token"]) {
      const res = await post({ ...valid, token })
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ ok: false, error: "turnstile" })
    }
    expect(email.sent).toEqual([])
  })

  it("refuses answers that fail the checks, with the field", async () => {
    const email = localEmail()
    const { post } = setup(email)
    const cases: [Record<string, unknown>, string][] = [
      [{ message: "a".repeat(LIMITS.message + 1) }, "message"],
      [{ name: "a".repeat(LIMITS.name + 1) }, "name"],
      [{ email: "not-an-email" }, "email"],
      [{ details: { ...answers.details, role: "Chef" } }, "details"],
    ]
    for (const [change, field] of cases) {
      const res = await post({ ...valid, answers: { ...answers, ...change } })
      expect(res.status).toBe(400)
      const body = await res.json<{ error: string; fields: object }>()
      expect(body.error).toBe("invalid")
      expect(Object.keys(body.fields)).toContain(field)
    }
    expect(email.sent).toEqual([])
  })

  it("answers a failing sender with 502 send, without logging the answers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const { post } = setup({
      send: async () => {
        throw new Error(`could not send ${answers.message}`)
      },
    })
    const res = await post(valid)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "send" })
    expect(JSON.stringify(log.mock.calls)).not.toContain(answers.message)
    expect(JSON.stringify(log.mock.calls)).not.toContain(answers.email)
    log.mockRestore()
  })

  it("answers an unset CONTACT_TO with 502 send", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {})
    const email = localEmail()
    const { post } = setup(email, { CONTACT_TO: "" })
    const res = await post(valid)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "send" })
    expect(email.sent).toEqual([])
  })

  it("sends one email for a valid hiring submission", async () => {
    const email = localEmail()
    const { post } = setup(email)
    const res = await post(valid)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(email.sent).toHaveLength(1)
    const [message] = email.sent
    expect(message.to).toBe("kate@example.com")
    expect(message.from).toEqual(SENDER)
    expect(message.replyTo).toEqual({
      email: "sam@example.com",
      name: "Sam Lee",
    })
    expect(message.subject).toBe("[katefrench.me] Hiring · Sales · New York")
  })

  it("never takes the recipient from the body", async () => {
    const email = localEmail()
    const { post } = setup(email)
    await post({
      ...valid,
      to: "evil@example.com",
      CONTACT_TO: "evil@example.com",
      answers: { ...answers, to: "evil@example.com" },
    })
    expect(email.sent.map((m) => m.to)).toEqual(["kate@example.com"])
  })
})

describe("saving leads", () => {
  beforeEach(async () => {
    await workerEnv.DB.prepare("DELETE FROM booking_requests").run()
    await workerEnv.DB.prepare("DELETE FROM leads").run()
  })

  it("stores a lead with every field", async () => {
    const { post } = setup()
    const res = await post({
      ...valid,
      from: "numbers",
      answers: {
        ...answers,
        message: "  We need someone to open New York.  ",
        name: "  Sam Lee ",
        email: " sam@example.com ",
        company: " Acme ",
      },
    })
    expect(res.status).toBe(200)
    const rows = await leads()
    expect(rows).toHaveLength(1)
    const [lead] = rows
    expect(Object.keys(lead).sort()).toEqual([
      "answers",
      "company",
      "created_at",
      "email",
      "from_section",
      "id",
      "intent",
      "name",
      "status",
    ])
    expect(lead.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(new Date(lead.created_at).toISOString()).toBe(lead.created_at)
    expect(lead.intent).toBe("hiring")
    expect(JSON.parse(lead.answers)).toEqual({
      details: answers.details,
      message: "We need someone to open New York.",
    })
    expect(lead.name).toBe("Sam Lee")
    expect(lead.email).toBe("sam@example.com")
    expect(lead.company).toBe("Acme")
    expect(lead.from_section).toBe("numbers")
    expect(lead.status).toBe("new")
  })

  it("stores a blank company as NULL", async () => {
    const { post } = setup()
    await post({ ...valid, answers: { ...answers, company: "  " } })
    expect((await leads())[0].company).toBeNull()
  })

  it("stores an unknown or missing from as NULL", async () => {
    const { post } = setup()
    for (const body of [
      { ...valid, from: "evil" },
      { ...valid, from: 7 },
      { ...valid, from: "Numbers" },
      valid,
    ]) {
      const res = await post(body)
      expect(res.status).toBe(200)
    }
    const rows = await leads()
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.from_section)).toEqual([null, null, null, null])
  })

  it("stores no row when a check fails", async () => {
    const { app, post } = setup()
    await app.request(URL, {}, env)
    await post(valid, { Origin: "https://evil.example" })
    await post({ ...valid, padding: "a".repeat(LIMITS.body) })
    await post(valid, { "Content-Length": String(LIMITS.body + 1) })
    await post("not json")
    await post({ ...valid, website: "https://spam.example" })
    await post({ ...valid, token: "wrong-token" })
    await post({ ...valid, answers: { ...answers, email: "not-an-email" } })
    expect(await leads()).toEqual([])
  })

  it("keeps the lead when the email fails", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {})
    const { post } = setup({
      send: async () => {
        throw new Error("down")
      },
    })
    const res = await post({ ...valid, from: "venues" })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "send" })
    const rows = await leads()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("new")
  })

  it("keeps the lead when CONTACT_TO is unset", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {})
    const { post } = setup(localEmail(), { CONTACT_TO: "" })
    const res = await post(valid)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "send" })
    const rows = await leads()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("new")
  })

  it("still sends the email when the insert fails, without logging the answers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const email = localEmail()
    const broken = {
      prepare: () => {
        throw new Error(`no table for ${answers.name} ${answers.email}`)
      },
    } as unknown as D1Database
    const { post } = setup(email, { DB: broken })
    const res = await post(valid)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(email.sent).toHaveLength(1)
    expect(log).toHaveBeenCalledWith("contact: lead insert failed", "unknown")
    const logged = JSON.stringify(log.mock.calls)
    for (const value of [
      answers.name,
      answers.email,
      answers.message,
      answers.company,
    ]) {
      expect(logged).not.toContain(value)
    }
    log.mockRestore()
  })

  it("refuses a status outside the five values", async () => {
    await expect(
      workerEnv.DB.prepare(
        "INSERT INTO leads (id, created_at, intent, answers, name, email, status) VALUES ('x', 'now', 'hiring', '{}', 'n', 'e', 'pending')",
      ).run(),
    ).rejects.toThrow(/CHECK/)
  })
})

type BookingRow = {
  id: string
  lead_id: string
  created_at: string
  answers: string
  start_at: string
  minutes: number
  status: string
  confirm_hash: string
  decline_hash: string
  answered_at: string | null
}

const requests = async () =>
  (
    await workerEnv.DB.prepare(
      "SELECT * FROM booking_requests",
    ).all<BookingRow>()
  ).results

const linkToken = (text: string, label: "Confirm" | "Decline") =>
  text.match(
    new RegExp(
      `^${label}: https://katefrench\\.me/booking/([A-Za-z0-9_-]{43})$`,
      "m",
    ),
  )?.[1]

describe("call requests", () => {
  beforeEach(async () => {
    await workerEnv.DB.prepare("DELETE FROM booking_requests").run()
    await workerEnv.DB.prepare("DELETE FROM leads").run()
  })

  const withTime = (time: unknown) => ({
    ...valid,
    answers: { ...answers, time },
  })

  it("stores a pending request holding only hashes of the emailed tokens", async () => {
    const email = localEmail()
    const { post } = setup(email)
    const res = await post(withTime(OFFERED))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const [lead] = await leads()
    const rows = await requests()
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.lead_id).toBe(lead.id)
    expect(row.status).toBe("pending")
    expect(row.start_at).toBe(OFFERED)
    expect(row.minutes).toBe(20)
    expect(row.answered_at).toBeNull()
    expect(row.created_at).toBe(NOW.toISOString())
    expect(JSON.parse(row.answers)).toMatchObject({
      ...answers,
      time: OFFERED,
    })

    expect(email.sent).toHaveLength(1)
    const [message] = email.sent
    expect(message.subject).toBe("[katefrench.me] Hiring · Sales · New York")
    expect(message.text).toContain(
      "Want to talk it through?\nTuesday, November 24 at 9:00 AM EST, 20 minutes",
    )
    const confirm = linkToken(message.text, "Confirm")!
    const decline = linkToken(message.text, "Decline")!
    expect(confirm).toBeTruthy()
    expect(decline).toBeTruthy()
    expect(confirm).not.toBe(decline)
    expect(row.confirm_hash).toBe(await hashToken(confirm))
    expect(row.decline_hash).toBe(await hashToken(decline))
    expect(row.confirm_hash).toMatch(/^[0-9a-f]{64}$/)
    const stored = JSON.stringify(row)
    expect(stored).not.toContain(confirm)
    expect(stored).not.toContain(decline)
  })

  it("uses the request's origin for the links", async () => {
    const email = localEmail()
    const { app } = setup(email)
    const res = await app.request(
      "http://localhost:5170/api/contact",
      {
        method: "POST",
        headers: { Origin: "http://localhost:5170" },
        body: JSON.stringify(withTime(OFFERED)),
      },
      env,
    )
    expect(res.status).toBe(200)
    expect(email.sent[0].text).toMatch(
      /^Confirm: http:\/\/localhost:5170\/booking\/[A-Za-z0-9_-]{43}$/m,
    )
  })

  it("refuses a time not on offer, a past time or junk, and stores nothing", async () => {
    const email = localEmail()
    const { post } = setup(email)
    for (const time of [
      "2026-11-24T17:00:00.000Z",
      "2026-11-24T14:10:00.000Z",
      "2026-11-28T14:00:00.000Z",
      "2026-11-20T14:00:00.000Z",
      "soon",
    ]) {
      const res = await post(withTime(time))
      expect(res.status, time).toBe(400)
      expect(await res.json()).toEqual({
        ok: false,
        error: "invalid",
        fields: { time: TIME_TAKEN },
      })
    }
    expect(await leads()).toEqual([])
    expect(await requests()).toEqual([])
    expect(email.sent).toEqual([])
  })

  it("refuses any time when there is no calendar or it throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const broken: Calendar = {
      busy: async () => {
        throw new Error("down")
      },
      createEvent: async () => ({ videoLink: "" }),
    }
    for (const calendar of [null, broken]) {
      const email = localEmail()
      const { post } = setup(email, {}, { calendar })
      const res = await post(withTime(OFFERED))
      expect(res.status).toBe(400)
      const body = await res.json<{ fields: object }>()
      expect(body.fields).toEqual({ time: TIME_TAKEN })
      expect(email.sent).toEqual([])
    }
    expect(await leads()).toEqual([])
    expect(await requests()).toEqual([])
    log.mockRestore()
  })

  it("treats a missing time or no call as today, with no request", async () => {
    const email = localEmail()
    const { post } = setup(email, {}, { calendar: null })
    expect((await post(valid)).status).toBe(200)
    expect((await post(withTime(NO_CALL))).status).toBe(200)
    expect(await leads()).toHaveLength(2)
    expect(await requests()).toEqual([])
    const [missing, none] = email.sent
    expect(missing.text).toBe(none.text)
    expect(missing.subject).toBe(none.subject)
    expect(missing.text).toContain(
      "Want to talk it through?\nNo call, just email me",
    )
    expect(missing.text).not.toContain("Confirm:")
  })

  it("asks for a time when the time is empty", async () => {
    const { post } = setup()
    const res = await post(withTime(""))
    expect(res.status).toBe(400)
    const body = await res.json<{ fields: object }>()
    expect(Object.keys(body.fields)).toEqual(["time"])
  })

  it("still sends the email with the time but no links when the request insert fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const email = localEmail()
    const db = workerEnv.DB
    const failing = {
      prepare: (sql: string) => {
        if (sql.startsWith("INSERT INTO booking_requests")) {
          throw new Error("no table")
        }
        return db.prepare(sql)
      },
    } as unknown as D1Database
    const { post } = setup(email, { DB: failing })
    const res = await post(withTime(OFFERED))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await leads()).toHaveLength(1)
    expect(await requests()).toEqual([])
    expect(email.sent).toHaveLength(1)
    expect(email.sent[0].text).toContain("Tuesday, November 24 at 9:00 AM EST")
    expect(email.sent[0].text).not.toContain("Confirm:")
    expect(email.sent[0].text).not.toContain("Decline:")
    expect(log).toHaveBeenCalledWith(
      "contact: booking request insert failed",
      "unknown",
    )
    log.mockRestore()
  })
})

describe("the mounted route", () => {
  it("runs through the Worker with the local stand-ins", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const res = await exports.default.fetch(
      new Request("https://example.com/api/contact", {
        method: "POST",
        headers: { Origin: "https://example.com" },
        body: JSON.stringify(valid),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(JSON.stringify(log.mock.calls)).toContain(
      "[katefrench.me] Hiring · Sales · New York",
    )
    log.mockRestore()

    const get = await exports.default.fetch(
      new Request("https://example.com/api/contact"),
    )
    expect(get.status).toBe(405)
  })
})

describe("siteverify", () => {
  it("posts the secret, token and IP and reads success", async () => {
    const fake = vi.fn(async () => Response.json({ success: true }))
    const ok = await siteverify("secret", fake as typeof fetch).verify(
      "token",
      "203.0.113.7",
    )
    expect(ok).toBe(true)
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    )
    const form = init.body as FormData
    expect(form.get("secret")).toBe("secret")
    expect(form.get("response")).toBe("token")
    expect(form.get("remoteip")).toBe("203.0.113.7")
  })

  it("returns false on a failed check or any error", async () => {
    const no = vi.fn(async () => Response.json({ success: false }))
    expect(await siteverify("s", no as typeof fetch).verify("t")).toBe(false)
    const truthy = vi.fn(async () => Response.json({ success: "yes" }))
    expect(await siteverify("s", truthy as typeof fetch).verify("t")).toBe(
      false,
    )
    const broken = vi.fn(async () => {
      throw new Error("down")
    })
    expect(await siteverify("s", broken as typeof fetch).verify("t")).toBe(
      false,
    )
    expect(await siteverify("s").verify("t")).toBe(false)
  })
})

describe("localTurnstile", () => {
  it("accepts only the dummy token", async () => {
    const turnstile = localTurnstile()
    expect(await turnstile.verify(DUMMY_TOKEN)).toBe(true)
    expect(await turnstile.verify("anything else")).toBe(false)
  })
})

describe("cloudflareEmail", () => {
  it("hands the message to the send_email binding", async () => {
    const send = vi.fn(async () => ({ messageId: "1" }))
    const message: EmailMessage = {
      from: SENDER,
      to: "kate@example.com",
      replyTo: { email: "sam@example.com", name: "Sam" },
      subject: "Hi",
      text: "Hello",
    }
    await cloudflareEmail({ send } as unknown as SendEmail).send(message)
    expect(send).toHaveBeenCalledWith(message)
  })

  it("passes a send failure on", async () => {
    const send = vi.fn(async () => {
      throw new Error("no")
    })
    await expect(
      cloudflareEmail({ send } as unknown as SendEmail).send(
        {} as EmailMessage,
      ),
    ).rejects.toThrow("no")
  })
})
