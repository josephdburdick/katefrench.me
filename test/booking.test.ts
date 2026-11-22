import { exports, env as workerEnv } from "cloudflare:workers"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SENDER } from "../src/lib/contact-form"
import type { LeadDetail, LeadsResponse } from "../src/lib/leads"
import { bookingApp } from "../worker/booking"
import { type Calendar, localCalendar } from "../worker/calendar"
import { type ContactServices, contactApp } from "../worker/contact"
import { type EmailSender, localEmail } from "../worker/email"
import type { Env } from "../worker/env"
import { DUMMY_TOKEN, localTurnstile } from "../worker/turnstile"

const ORIGIN = "https://katefrench.me"
const env = { CONTACT_TO: "kate@example.com", DB: workerEnv.DB } as Env
const START = "2026-11-24T14:00:00.000Z"

const answers = {
  intent: "hiring",
  details: { role: "Sales", location: "New York", start: "Right away" },
  message: "We need someone to open New York.",
  name: "Sam Lee",
  email: "sam@example.com",
  company: "Acme",
  time: START,
}

type Row = { status: string; answered_at: string | null }

const requestRow = async () =>
  (await workerEnv.DB.prepare(
    "SELECT status, answered_at FROM booking_requests",
  ).first<Row>())!

const leadStatus = async () =>
  (await workerEnv.DB.prepare("SELECT status FROM leads").first<{
    status: string
  }>())!.status

async function setup(
  options: {
    calendar?: Calendar | null
    email?: EmailSender
    now?: Date
  } = {},
) {
  const calendar = localCalendar()
  const email = localEmail()
  let now = options.now ?? new Date("2026-11-23T14:00:00.000Z")
  const services: ContactServices = {
    email: options.email ?? email,
    turnstile: localTurnstile(),
    calendar: options.calendar === undefined ? calendar : options.calendar,
    now: () => now,
  }

  const contact = new Hono<{ Bindings: Env }>().route(
    "/api/contact",
    contactApp({ ...services, email, calendar }),
  )
  const res = await contact.request(
    `${ORIGIN}/api/contact`,
    {
      method: "POST",
      headers: { Origin: ORIGIN },
      body: JSON.stringify({ answers, token: DUMMY_TOKEN, website: "" }),
    },
    env,
  )
  expect(res.status).toBe(200)
  const text = email.sent[0].text
  const token = (label: string) =>
    text.match(new RegExp(`^${label}: ${ORIGIN}/booking/(\\S+)$`, "m"))![1]
  email.sent.length = 0

  const app = new Hono<{ Bindings: Env }>().route(
    "/api/booking",
    bookingApp(services),
  )
  const call = (
    token: string,
    method = "GET",
    headers: Record<string, string> = { Origin: ORIGIN },
  ) => app.request(`${ORIGIN}/api/booking/${token}`, { method, headers }, env)

  return {
    calendar,
    email,
    confirm: token("Confirm"),
    decline: token("Decline"),
    call,
    post: (token: string) => call(token, "POST"),
    setNow: (date: Date) => {
      now = date
    },
  }
}

describe("booking links", () => {
  beforeEach(async () => {
    await workerEnv.DB.prepare("DELETE FROM booking_requests").run()
    await workerEnv.DB.prepare("DELETE FROM leads").run()
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  it("GET shows the open request and changes nothing", async () => {
    const { call, confirm, decline, calendar, email } = await setup()
    for (const [token, action] of [
      [confirm, "confirm"],
      [decline, "decline"],
    ]) {
      for (let i = 0; i < 2; i++) {
        const res = await call(token)
        expect(res.status).toBe(200)
        expect(res.headers.get("Cache-Control")).toBe("no-store")
        expect(await res.json()).toEqual({
          state: "open",
          action,
          start: START,
          minutes: 20,
          name: "Sam Lee",
          timeZone: "America/New_York",
        })
      }
    }
    expect(await requestRow()).toEqual({ status: "pending", answered_at: null })
    expect(await leadStatus()).toBe("new")
    expect(calendar.created).toEqual([])
    expect(email.sent).toEqual([])
  })

  it("confirm creates the event, books the lead and emails the visitor", async () => {
    const { post, confirm, calendar, email } = await setup()
    const res = await post(confirm)
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(await res.json()).toEqual({
      state: "confirmed",
      start: START,
      videoLink: "https://meet.example.com/local-1",
      emailed: true,
    })

    expect(calendar.created).toHaveLength(1)
    const [event] = calendar.created
    expect(event).toMatchObject({
      start: START,
      end: "2026-11-24T14:20:00.000Z",
      summary: "Call: Kate French and Sam Lee",
      guest: { email: "sam@example.com", name: "Sam Lee" },
    })
    expect(event.description).toContain("We need someone to open New York.")
    expect(event.description).not.toContain("/booking/")

    const row = await requestRow()
    expect(row.status).toBe("confirmed")
    expect(row.answered_at).toBe("2026-11-23T14:00:00.000Z")
    expect(await leadStatus()).toBe("call-booked")

    expect(email.sent).toHaveLength(1)
    const [message] = email.sent
    expect(message.to).toBe("sam@example.com")
    expect(message.from).toEqual(SENDER)
    expect(message.replyTo).toEqual({
      email: "kate@example.com",
      name: "Kate French",
    })
    expect(message.text).toContain("Tuesday, November 24 at 9:00 AM EST")
    expect(message.text).toContain("20 minutes")
    expect(message.text).toContain("https://meet.example.com/local-1")
  })

  it("confirm on a now-busy time returns taken, keeps it pending, and decline still works", async () => {
    const busy = localCalendar()
    await busy.createEvent({
      start: "2026-11-24T14:10:00.000Z",
      end: "2026-11-24T14:30:00.000Z",
      summary: "",
      description: "",
      guest: { email: "", name: "" },
    })
    const { post, call, confirm, decline, email } = await setup({
      calendar: busy,
    })
    const res = await post(confirm)
    expect(await res.json()).toEqual({ state: "taken" })
    expect(busy.created).toHaveLength(1)
    expect(await requestRow()).toEqual({ status: "pending", answered_at: null })
    expect(await leadStatus()).toBe("new")
    expect(email.sent).toEqual([])

    expect((await call(confirm)).status).toBe(200)
    expect(await (await call(confirm)).json()).toMatchObject({ state: "open" })

    const declined = await post(decline)
    expect(await declined.json()).toEqual({ state: "declined", emailed: true })
    expect((await requestRow()).status).toBe("declined")
  })

  it("confirm on a past time returns taken and creates nothing", async () => {
    const { post, confirm, calendar, setNow } = await setup()
    setNow(new Date("2026-11-24T14:00:00.000Z"))
    expect(await (await post(confirm)).json()).toEqual({ state: "taken" })
    expect(calendar.created).toEqual([])
    expect((await requestRow()).status).toBe("pending")
  })

  it("confirm returns taken when there is no calendar or it fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const broken: Calendar = {
      busy: async () => [],
      createEvent: async () => {
        throw new Error("down")
      },
    }
    for (const calendar of [null, broken]) {
      await workerEnv.DB.prepare("DELETE FROM booking_requests").run()
      await workerEnv.DB.prepare("DELETE FROM leads").run()
      const { post, confirm } = await setup({ calendar })
      expect(await (await post(confirm)).json()).toEqual({ state: "taken" })
      expect(await requestRow()).toEqual({
        status: "pending",
        answered_at: null,
      })
    }
    log.mockRestore()
  })

  it("decline marks it declined and emails the note", async () => {
    const { post, decline, calendar, email } = await setup()
    const res = await post(decline)
    expect(await res.json()).toEqual({ state: "declined", emailed: true })
    expect((await requestRow()).status).toBe("declined")
    expect(await leadStatus()).toBe("new")
    expect(calendar.created).toEqual([])
    expect(email.sent).toHaveLength(1)
    const [message] = email.sent
    expect(message.to).toBe("sam@example.com")
    expect(message.replyTo.email).toBe("kate@example.com")
    expect(message.text).toContain("Tuesday, November 24 at 9:00 AM EST")
    expect(message.text).toContain("reply to your message by email")
  })

  it("says emailed is false when the visitor email fails, and keeps the answer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const failing: EmailSender = {
      send: async () => {
        throw new Error("down")
      },
    }
    const first = await setup({ email: failing })
    expect(await (await first.post(first.confirm)).json()).toMatchObject({
      state: "confirmed",
      emailed: false,
    })
    expect((await requestRow()).status).toBe("confirmed")
    log.mockRestore()
  })

  it("returns used for either link after either action", async () => {
    for (const action of ["confirm", "decline"] as const) {
      await workerEnv.DB.prepare("DELETE FROM booking_requests").run()
      await workerEnv.DB.prepare("DELETE FROM leads").run()
      const links = await setup()
      expect((await links.post(links[action])).status).toBe(200)
      for (const token of [links.confirm, links.decline]) {
        expect(await (await links.call(token)).json()).toEqual({
          state: "used",
        })
        expect(await (await links.post(token)).json()).toEqual({
          state: "used",
        })
      }
      expect(links.calendar.created.length).toBe(action === "confirm" ? 1 : 0)
      expect(links.email.sent).toHaveLength(1)
    }
  })

  it("shows a confirmed call as call booked in Kate's leads inbox", async () => {
    const { post, confirm } = await setup()
    await post(confirm)
    const inbox = (path: string) =>
      exports.default.fetch(
        new Request(`${ORIGIN}/api/edit/dev-owner-token/leads${path}`),
      )
    const list = await (await inbox("")).json<LeadsResponse>()
    expect(list.leads).toMatchObject([
      { name: "Sam Lee", status: "call-booked" },
    ])
    expect(list.summary.byStatus["call-booked"]).toBe(1)
    const detail = await (
      await inbox(`/${list.leads[0].id}`)
    ).json<LeadDetail>()
    expect(detail.status).toBe("call-booked")
  })

  it("lets Kate delete a lead with a pending request, after which both links are used", async () => {
    const { call, confirm, decline } = await setup()
    const { id } = (await workerEnv.DB.prepare("SELECT id FROM leads").first<{
      id: string
    }>())!
    const res = await exports.default.fetch(
      new Request(`${ORIGIN}/api/edit/dev-owner-token/leads/${id}`, {
        method: "DELETE",
      }),
    )
    expect(res.status).toBe(200)
    expect(
      await workerEnv.DB.prepare("SELECT * FROM booking_requests").all(),
    ).toMatchObject({ results: [] })
    for (const token of [confirm, decline]) {
      expect(await (await call(token)).json()).toEqual({ state: "used" })
    }
  })

  it("returns used for an unknown or malformed token, before any database call", async () => {
    const { call, post, confirm } = await setup()
    const unknown = "A".repeat(43)
    for (const token of [
      unknown,
      "short",
      `${confirm}x`,
      confirm.slice(0, 42) + "+",
      encodeURIComponent(confirm.slice(0, 42) + "="),
    ]) {
      expect(await (await call(token)).json()).toEqual({ state: "used" })
      expect(await (await post(token)).json()).toEqual({ state: "used" })
    }
    expect((await requestRow()).status).toBe("pending")

    const prepare = vi.fn()
    const app = new Hono<{ Bindings: Env }>().route(
      "/api/booking",
      bookingApp({
        email: localEmail(),
        turnstile: localTurnstile(),
        calendar: null,
      }),
    )
    const res = await app.request(
      `${ORIGIN}/api/booking/short`,
      {},
      {
        ...env,
        DB: { prepare } as unknown as D1Database,
      },
    )
    expect(await res.json()).toEqual({ state: "used" })
    expect(prepare).not.toHaveBeenCalled()
  })

  it("refuses a POST with a foreign or missing Origin, and other methods", async () => {
    const { call, confirm, calendar } = await setup()
    const evil = await call(confirm, "POST", { Origin: "https://evil.example" })
    expect(evil.status).toBe(403)
    const none = await call(confirm, "POST", {})
    expect(none.status).toBe(403)
    const put = await call(confirm, "PUT")
    expect(put.status).toBe(405)
    expect(put.headers.get("Allow")).toBe("GET, POST")
    expect((await requestRow()).status).toBe("pending")
    expect(calendar.created).toEqual([])
  })
})
