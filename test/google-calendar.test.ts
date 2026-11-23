import { env as workerEnv } from "cloudflare:workers"
import { describe, expect, it, vi } from "vitest"

import type { CalendarEvent } from "../worker/calendar"
import type { Env } from "../worker/env"
import { GOOGLE_SCOPES, googleCalendar } from "../worker/google-calendar"
import { servicesFor } from "../worker/services"

const credentials = {
  clientId: "client-id-123",
  clientSecret: "client-secret-456",
  refreshToken: "refresh-token-789",
}
const ACCESS = "access-token-abc"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy"

const from = new Date("2026-11-23T14:00:00.000Z")
const to = new Date("2026-11-23T22:00:00.000Z")

const event: CalendarEvent = {
  start: "2026-11-24T14:00:00.000Z",
  end: "2026-11-24T14:20:00.000Z",
  summary: "Call: Kate French and Sam Lee",
  description: "Sam wants to talk about New York.",
  guest: { email: "sam@example.com", name: "Sam Lee" },
}

type Call = { url: string; init: RequestInit }
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

function fakeGoogle(handlers: {
  token?: Handler
  freeBusy?: Handler
  event?: Handler
}) {
  const calls: Call[] = []
  let tokens = 0
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const request = init ?? {}
      calls.push({ url, init: request })
      if (url === TOKEN_URL) {
        tokens += 1
        return (
          handlers.token?.(url, request) ??
          Response.json({
            access_token: `${ACCESS}-${tokens}`,
            expires_in: 3600,
          })
        )
      }
      if (url === FREEBUSY_URL) {
        return (
          handlers.freeBusy?.(url, request) ??
          Response.json({ calendars: { primary: { busy: [] } } })
        )
      }
      return (
        handlers.event?.(url, request) ??
        Response.json({ hangoutLink: "https://meet.google.com/abc-defg-hij" })
      )
    },
  )
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

const header = (init: RequestInit, name: string) =>
  new Headers(init.headers).get(name)
const json = (init: RequestInit) => JSON.parse(String(init.body))

const secrets = [
  credentials.clientId,
  credentials.clientSecret,
  credentials.refreshToken,
  ACCESS,
  event.guest.email,
  event.guest.name,
]

async function failure(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    return error as Error & { code?: string }
  }
  throw new Error("expected a throw")
}

function expectClean(error: Error, ...extra: string[]) {
  for (const secret of [...secrets, ...extra]) {
    expect(String(error)).not.toContain(secret)
    expect(error.message).not.toContain(secret)
  }
}

describe("googleCalendar access token", () => {
  it("refreshes the token with a form post, then calls FreeBusy with it", async () => {
    const { fetchImpl, calls } = fakeGoogle({})
    await googleCalendar(credentials, fetchImpl).busy(from, to)

    expect(calls.map((call) => call.url)).toEqual([TOKEN_URL, FREEBUSY_URL])
    const token = calls[0]!
    expect(token.init.method).toBe("POST")
    expect(header(token.init, "Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    )
    const form = new URLSearchParams(String(token.init.body))
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    })
    expect(header(calls[1]!.init, "Authorization")).toBe(`Bearer ${ACCESS}-1`)
  })

  it("reuses the token until 60 seconds before it expires", async () => {
    let clock = 1_000_000
    const { fetchImpl, calls } = fakeGoogle({})
    const calendar = googleCalendar(credentials, fetchImpl, () => clock)
    const tokenCalls = () => calls.filter((call) => call.url === TOKEN_URL)

    await calendar.busy(from, to)
    clock += (3600 - 60) * 1000 - 1
    await calendar.busy(from, to)
    expect(tokenCalls()).toHaveLength(1)
    expect(header(calls.at(-1)!.init, "Authorization")).toBe(
      `Bearer ${ACCESS}-1`,
    )

    clock += 1
    await calendar.createEvent(event)
    expect(tokenCalls()).toHaveLength(2)
    expect(header(calls.at(-1)!.init, "Authorization")).toBe(
      `Bearer ${ACCESS}-2`,
    )
  })

  it("throws google-token on a bad status, a rejected fetch, non-JSON or a bad shape", async () => {
    const body = "invalid_grant: Token has been expired or revoked."
    const cases: Handler[] = [
      () => new Response(body, { status: 400 }),
      () => {
        throw new Error(`network down ${credentials.refreshToken}`)
      },
      () => new Response(`<html>${body}</html>`, { status: 200 }),
      () => Response.json({ access_token: "", expires_in: 3600 }),
      () => Response.json({ access_token: ACCESS, expires_in: 0 }),
      () => Response.json({ access_token: ACCESS }),
    ]
    for (const token of cases) {
      const { fetchImpl, calls } = fakeGoogle({ token })
      const error = await failure(() =>
        googleCalendar(credentials, fetchImpl).busy(from, to),
      )
      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe("google-token")
      expectClean(error, body, "invalid_grant")
      expect(calls.map((call) => call.url)).toEqual([TOKEN_URL])
    }
  })
})

describe("googleCalendar busy", () => {
  it("posts the window and the primary calendar to FreeBusy", async () => {
    const { fetchImpl, calls } = fakeGoogle({})
    await googleCalendar(credentials, fetchImpl).busy(from, to)
    const call = calls[1]!
    expect(call.url).toBe(FREEBUSY_URL)
    expect(call.init.method).toBe("POST")
    expect(json(call.init)).toEqual({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: "primary" }],
    })
  })

  it("returns only overlapping intervals as sorted ISO UTC start and end", async () => {
    const { fetchImpl } = fakeGoogle({
      freeBusy: () =>
        Response.json({
          kind: "calendar#freeBusy",
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-11-23T12:00:00-05:00",
                  end: "2026-11-23T13:00:00-05:00",
                  summary: "Lunch with someone",
                },
                {
                  start: "2026-11-23T13:00:00.000Z",
                  end: "2026-11-23T14:00:00.000Z",
                },
                {
                  start: "2026-11-23T22:00:00.000Z",
                  end: "2026-11-23T23:00:00.000Z",
                },
                {
                  start: "2026-11-23T13:30:00Z",
                  end: "2026-11-23T14:30:00Z",
                  attendees: ["guest@example.com"],
                },
              ],
            },
          },
        }),
    })
    const busy = await googleCalendar(credentials, fetchImpl).busy(from, to)
    expect(busy).toEqual([
      { start: "2026-11-23T13:30:00.000Z", end: "2026-11-23T14:30:00.000Z" },
      { start: "2026-11-23T17:00:00.000Z", end: "2026-11-23T18:00:00.000Z" },
    ])
    for (const interval of busy) {
      expect(Object.keys(interval).sort()).toEqual(["end", "start"])
      expect(interval.start.endsWith("Z")).toBe(true)
      expect(interval.end.endsWith("Z")).toBe(true)
    }
  })

  it("throws google-freebusy on calendar errors, a missing primary, a bad status, a bad shape or a bad date", async () => {
    const body = "Backend Error from upstream"
    const cases: Handler[] = [
      () =>
        Response.json({
          calendars: {
            primary: { errors: [{ reason: "notFound" }], busy: [] },
          },
        }),
      () => Response.json({ calendars: {} }),
      () => Response.json({}),
      () => new Response(body, { status: 500 }),
      () => new Response(body, { status: 200 }),
      () => Response.json({ calendars: { primary: { busy: "none" } } }),
      () =>
        Response.json({
          calendars: {
            primary: { busy: [{ start: "soon", end: "2026-11-23T15:00Z" }] },
          },
        }),
      () =>
        Response.json({
          calendars: {
            primary: { busy: [{ start: "2026-11-23T15:00:00Z" }] },
          },
        }),
      () => {
        throw new Error("network down")
      },
    ]
    for (const freeBusy of cases) {
      const { fetchImpl } = fakeGoogle({ freeBusy })
      const error = await failure(() =>
        googleCalendar(credentials, fetchImpl).busy(from, to),
      )
      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe("google-freebusy")
      expectClean(error, body)
    }
  })
})

describe("googleCalendar createEvent", () => {
  it("inserts a primary-calendar event with the guest and a Meet request", async () => {
    const { fetchImpl, calls } = fakeGoogle({})
    await googleCalendar(credentials, fetchImpl).createEvent(event)
    const call = calls[1]!
    const url = new URL(call.url)
    expect(url.origin).toBe("https://www.googleapis.com")
    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events")
    expect(url.searchParams.get("conferenceDataVersion")).toBe("1")
    expect(url.searchParams.get("sendUpdates")).toBe("all")
    expect(call.init.method).toBe("POST")
    expect(header(call.init, "Authorization")).toBe(`Bearer ${ACCESS}-1`)

    const body = json(call.init)
    expect(body.summary).toBe(event.summary)
    expect(body.description).toBe(event.description)
    expect(body.start).toEqual({ dateTime: event.start })
    expect(body.end).toEqual({ dateTime: event.end })
    expect(body.attendees).toEqual([
      { email: event.guest.email, displayName: event.guest.name },
    ])
    const request = body.conferenceData.createRequest
    expect(typeof request.requestId).toBe("string")
    expect(request.requestId.length).toBeGreaterThan(0)
    expect(request.conferenceSolutionKey.type).toBe("hangoutsMeet")
  })

  it("returns the hangoutLink, or else the video entry point", async () => {
    const withHangout = fakeGoogle({
      event: () =>
        Response.json({
          hangoutLink: "https://meet.google.com/aaa-bbbb-ccc",
          conferenceData: {
            entryPoints: [
              { entryPointType: "video", uri: "https://meet.google.com/other" },
            ],
          },
        }),
    })
    expect(
      await googleCalendar(credentials, withHangout.fetchImpl).createEvent(
        event,
      ),
    ).toEqual({ videoLink: "https://meet.google.com/aaa-bbbb-ccc" })

    const withEntryPoint = fakeGoogle({
      event: () =>
        Response.json({
          conferenceData: {
            entryPoints: [
              { entryPointType: "phone", uri: "tel:+1-555-0100" },
              { entryPointType: "video", uri: "https://meet.google.com/ddd" },
            ],
          },
        }),
    })
    expect(
      await googleCalendar(credentials, withEntryPoint.fetchImpl).createEvent(
        event,
      ),
    ).toEqual({ videoLink: "https://meet.google.com/ddd" })
  })

  it("throws google-event without an https link, on a bad status, non-JSON or a rejected fetch", async () => {
    const body = `Forbidden for ${event.guest.email}`
    const cases: Handler[] = [
      () => Response.json({}),
      () => Response.json({ hangoutLink: "http://meet.google.com/abc" }),
      () => Response.json({ hangoutLink: 42 }),
      () =>
        Response.json({
          conferenceData: {
            entryPoints: [{ entryPointType: "phone", uri: "https://x.test" }],
          },
        }),
      () =>
        Response.json({
          conferenceData: {
            entryPoints: [{ entryPointType: "video", uri: "javascript:1" }],
          },
        }),
      () => new Response(body, { status: 403 }),
      () => new Response(body, { status: 200 }),
      () => {
        throw new Error(`network down ${event.guest.name}`)
      },
    ]
    for (const handler of cases) {
      const { fetchImpl } = fakeGoogle({ event: handler })
      const error = await failure(() =>
        googleCalendar(credentials, fetchImpl).createEvent(event),
      )
      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe("google-event")
      expectClean(error, body)
    }
  })
})

describe("googleCalendar extra busy calendars", () => {
  const work = "kate@work.example"
  const both = { ...credentials, busyCalendars: [work] }

  it("asks for every calendar and merges their busy times in order", async () => {
    const { fetchImpl, calls } = fakeGoogle({
      freeBusy: () =>
        Response.json({
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-11-23T18:00:00.000Z",
                  end: "2026-11-23T19:00:00.000Z",
                },
              ],
            },
            [work]: {
              busy: [
                {
                  start: "2026-11-23T15:00:00.000Z",
                  end: "2026-11-23T16:00:00.000Z",
                },
              ],
            },
          },
        }),
    })
    const busy = await googleCalendar(both, fetchImpl).busy(from, to)

    expect(json(calls[1]!.init).items).toEqual([
      { id: "primary" },
      { id: work },
    ])
    expect(busy).toEqual([
      { start: "2026-11-23T15:00:00.000Z", end: "2026-11-23T16:00:00.000Z" },
      { start: "2026-11-23T18:00:00.000Z", end: "2026-11-23T19:00:00.000Z" },
    ])
  })

  it("fails when a listed calendar can't be read, without naming it", async () => {
    for (const calendars of [
      { primary: { busy: [] } },
      {
        primary: { busy: [] },
        [work]: { errors: [{ reason: "notFound" }], busy: [] },
      },
    ]) {
      const { fetchImpl } = fakeGoogle({
        freeBusy: () => Response.json({ calendars }),
      })
      const error = await failure(() =>
        googleCalendar(both, fetchImpl).busy(from, to),
      )
      expect(error.code).toBe("google-freebusy")
      expectClean(error, work)
    }
  })

  it("still creates events only on the primary calendar", async () => {
    const { fetchImpl, calls } = fakeGoogle({})
    await googleCalendar(both, fetchImpl).createEvent(event)
    expect(calls.at(-1)!.url).toContain("/calendars/primary/events")
  })
})

describe("GOOGLE_SCOPES", () => {
  it("holds only the FreeBusy and events scopes", () => {
    expect([...GOOGLE_SCOPES]).toEqual([
      "https://www.googleapis.com/auth/calendar.freebusy",
      "https://www.googleapis.com/auth/calendar.events",
    ])
  })
})

describe("servicesFor calendar choice", () => {
  const google = {
    GOOGLE_CLIENT_ID: credentials.clientId,
    GOOGLE_CLIENT_SECRET: credentials.clientSecret,
    GOOGLE_REFRESH_TOKEN: credentials.refreshToken,
  }
  const base = workerEnv as unknown as Env
  const production = (overrides: Partial<Env> = {}): Env => ({
    ...base,
    LOCAL_SERVICES: undefined,
    ...google,
    ...overrides,
  })
  const localCalendar = servicesFor(base).calendar

  it("keeps the local calendar when LOCAL_SERVICES is 1, even with Google secrets", () => {
    expect(localCalendar).not.toBeNull()
    expect(
      servicesFor({ ...base, ...google, LOCAL_SERVICES: "1" }).calendar,
    ).toBe(localCalendar)
  })

  it("uses one Google calendar per set of secrets", () => {
    const first = servicesFor(production()).calendar
    expect(first).not.toBeNull()
    expect(first).not.toBe(localCalendar)
    expect(servicesFor(production()).calendar).toBe(first)
    expect(
      servicesFor(production({ GOOGLE_REFRESH_TOKEN: "another-token" }))
        .calendar,
    ).not.toBe(first)
  })

  it("builds a new calendar when the extra busy calendars change", () => {
    const first = servicesFor(production()).calendar
    const extra = servicesFor(
      production({ GOOGLE_BUSY_CALENDARS: " kate@work.example , " }),
    ).calendar
    expect(extra).not.toBeNull()
    expect(extra).not.toBe(first)
  })

  it("has no calendar when any Google secret is missing or blank", () => {
    for (const name of Object.keys(google) as (keyof typeof google)[]) {
      expect(servicesFor(production({ [name]: undefined })).calendar).toBeNull()
      expect(servicesFor(production({ [name]: "" })).calendar).toBeNull()
      expect(servicesFor(production({ [name]: "   " })).calendar).toBeNull()
    }
  })
})
