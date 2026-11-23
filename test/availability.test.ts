import { env as workerEnv } from "cloudflare:workers"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  type BookingSettings,
  availabilityApp,
  openTimes,
} from "../worker/availability"
import { type Calendar, localCalendar } from "../worker/calendar"
import type { ContactServices } from "../worker/contact"
import { localEmail } from "../worker/email"
import type { Env } from "../worker/env"
import { servicesFor } from "../worker/services"
import { localTurnstile } from "../worker/turnstile"

const settings: BookingSettings = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  callMinutes: 20,
  noticeHours: 0,
  timeZone: "America/New_York",
}

const at = (iso: string) => new Date(iso)
const onDay = (times: string[], day: string) =>
  times.filter((time) => time.startsWith(day))

describe("openTimes", () => {
  // Sunday noon UTC, so Monday 2026-11-23 is the first weekday.
  const sunday = at("2026-11-22T12:00:00.000Z")

  it("starts at start_hour and steps by the call length until end_hour", () => {
    const monday = onDay(openTimes(settings, [], sunday), "2026-11-23")
    expect(monday).toHaveLength(24)
    expect(monday[0]).toBe("2026-11-23T14:00:00.000Z")
    expect(monday[1]).toBe("2026-11-23T14:20:00.000Z")
    expect(monday.at(-1)).toBe("2026-11-23T21:40:00.000Z")
    expect(monday).not.toContain("2026-11-23T22:00:00.000Z")
  })

  it("leaves out a call that would run past end_hour", () => {
    const times = openTimes({ ...settings, callMinutes: 25 }, [], sunday)
    const monday = onDay(times, "2026-11-23")
    expect(monday.at(-1)).toBe("2026-11-23T21:30:00.000Z")
    expect(monday).not.toContain("2026-11-23T21:55:00.000Z")
  })

  it("leaves out weekends in the settings' time zone", () => {
    const times = openTimes(settings, [], sunday)
    const weekdays = new Set(
      times.map((time) =>
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
        }).format(new Date(time)),
      ),
    )
    expect([...weekdays].sort()).toEqual(["Fri", "Mon", "Thu", "Tue", "Wed"])
    expect(onDay(times, "2026-11-28")).toEqual([])
    expect(onDay(times, "2026-11-29")).toEqual([])
  })

  it("keeps the minimum notice, counting a time exactly at the limit", () => {
    const monday9 = at("2026-11-23T14:00:00.000Z")
    const times = openTimes({ ...settings, noticeHours: 24 }, [], monday9)
    expect(times[0]).toBe("2026-11-24T14:00:00.000Z")
    expect(onDay(times, "2026-11-23")).toEqual([])

    const later = openTimes(
      { ...settings, noticeHours: 24 },
      [],
      at("2026-11-23T14:00:01.000Z"),
    )
    expect(later[0]).toBe("2026-11-24T14:20:00.000Z")
  })

  it("stays within 14 days of now", () => {
    const now = at("2026-11-23T14:00:00.000Z")
    const times = openTimes(settings, [], now)
    expect(times[0]).toBe("2026-11-23T14:00:00.000Z")
    expect(times.at(-1)).toBe("2026-12-04T21:40:00.000Z")
    expect(times).not.toContain("2026-12-07T14:00:00.000Z")
    const end = now.getTime() + 14 * 24 * 3600_000
    expect(times.every((time) => Date.parse(time) < end)).toBe(true)
    expect(times).toEqual([...times].sort())

    const justBefore = openTimes(settings, [], at("2026-11-23T14:00:01.000Z"))
    expect(justBefore.at(-1)).toBe("2026-12-07T14:00:00.000Z")
  })

  it("leaves out busy times, but not ones that only touch", () => {
    const times = onDay(
      openTimes(
        settings,
        [
          {
            start: "2026-11-23T14:20:00.000Z",
            end: "2026-11-23T15:00:00.000Z",
          },
          {
            start: "2026-11-23T16:05:00.000Z",
            end: "2026-11-23T16:10:00.000Z",
          },
          { start: "not a date", end: "2026-11-23T20:00:00.000Z" },
        ],
        sunday,
      ),
      "2026-11-23",
    )
    expect(times.slice(0, 2)).toEqual([
      "2026-11-23T14:00:00.000Z",
      "2026-11-23T15:00:00.000Z",
    ])
    expect(times).not.toContain("2026-11-23T14:20:00.000Z")
    expect(times).not.toContain("2026-11-23T14:40:00.000Z")
    expect(times).not.toContain("2026-11-23T16:00:00.000Z")
    expect(times).toContain("2026-11-23T15:40:00.000Z")
    expect(times).toContain("2026-11-23T16:20:00.000Z")
  })

  it("keeps 9:00 local on both sides of the March daylight-saving change", () => {
    const every = { ...settings, weekdays: [1, 2, 3, 4, 5, 6, 7] }
    const times = openTimes(every, [], at("2026-03-06T00:00:00.000Z"))
    expect(onDay(times, "2026-03-07")[0]).toBe("2026-03-07T14:00:00.000Z")
    expect(onDay(times, "2026-03-08")[0]).toBe("2026-03-08T13:00:00.000Z")
    expect(onDay(times, "2026-03-08").at(-1)).toBe("2026-03-08T20:40:00.000Z")
  })

  it("keeps 9:00 local on both sides of the November daylight-saving change", () => {
    const every = { ...settings, weekdays: [1, 2, 3, 4, 5, 6, 7] }
    const times = openTimes(every, [], at("2026-10-30T00:00:00.000Z"))
    expect(onDay(times, "2026-10-31")[0]).toBe("2026-10-31T13:00:00.000Z")
    expect(onDay(times, "2026-11-01")[0]).toBe("2026-11-01T14:00:00.000Z")
    expect(onDay(times, "2026-11-01").at(-1)).toBe("2026-11-01T21:40:00.000Z")
  })
})

describe("GET /api/availability", () => {
  const now = () => at("2026-11-23T14:00:00.000Z")
  const base = { email: localEmail(), turnstile: localTurnstile(), now }
  const get = (
    services: ContactServices | ((env: Env) => ContactServices),
    env = workerEnv as unknown as Env,
  ) =>
    new Hono<{ Bindings: Env }>()
      .route("/api/availability", availabilityApp(services))
      .request("https://katefrench.me/api/availability", {}, env)

  it("returns only times and minutes, with the local calendar's lunch left out", async () => {
    const res = await get({ ...base, calendar: localCalendar() })
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    const body = await res.json<{ times: string[]; minutes: number }>()
    expect(Object.keys(body).sort()).toEqual(["minutes", "times"])
    expect(body.minutes).toBe(20)
    expect(body.times[0]).toBe("2026-11-24T14:00:00.000Z")
    expect(body.times).not.toContain("2026-11-24T17:00:00.000Z")
    expect(body.times).not.toContain("2026-11-24T17:40:00.000Z")
    expect(body.times).toContain("2026-11-24T18:00:00.000Z")
  })

  it("returns no times when there is no calendar", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await get({ ...base, calendar: null })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ times: [], minutes: 20 })
    expect(log).toHaveBeenCalledTimes(1)
    log.mockRestore()
  })

  it("returns no times when the calendar throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const broken: Calendar = {
      busy: async () => {
        throw new Error("down")
      },
      createEvent: async () => ({ videoLink: "" }),
    }
    const res = await get({ ...base, calendar: broken })
    expect(await res.json()).toEqual({ times: [], minutes: 20 })
    log.mockRestore()
  })

  it("returns no times with the production services and no Google secrets", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const production = {
      ...(workerEnv as unknown as Env),
      LOCAL_SERVICES: undefined,
    }
    expect(servicesFor(production).calendar).toBeNull()
    const res = await get(servicesFor, production)
    expect(res.status).toBe(200)
    const body = await res.json<{ times: string[] }>()
    expect(body.times).toEqual([])
    log.mockRestore()
  })

  it("returns no times when the Google calendar can't reach Google", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const production = {
      ...(workerEnv as unknown as Env),
      LOCAL_SERVICES: undefined,
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    }
    expect(servicesFor(production).calendar).not.toBeNull()
    vi.mocked(fetch).mockClear()
    const res = await get(servicesFor, production)
    expect(res.status).toBe(200)
    const body = await res.json<{ times: string[] }>()
    expect(body.times).toEqual([])
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "https://oauth2.googleapis.com/token",
    )
    log.mockRestore()
  })
})
