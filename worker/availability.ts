import { Hono } from "hono"

import type { Calendar, Interval } from "./calendar"
import type { ContactServices } from "./contact"
import type { Env } from "./env"

export type BookingSettings = {
  /** ISO weekday numbers, 1 = Monday. */
  weekdays: number[]
  startHour: number
  endHour: number
  callMinutes: number
  noticeHours: number
  timeZone: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
export const WINDOW_DAYS = 14

/** The migration's default, for the reply when the settings row can't be read. */
const DEFAULT_CALL_MINUTES = 20

const partsFormats = new Map<string, Intl.DateTimeFormat>()

function wallParts(instant: number, timeZone: string) {
  let format = partsFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
    partsFormats.set(timeZone, format)
  }
  const parts = Object.fromEntries(
    format
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

function offsetAt(instant: number, timeZone: string): number {
  const p = wallParts(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** The UTC instant of a local wall time. `minutes` may run past 59; it counts from midnight. */
export function wallToUtc(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, 0, minutes)
  const first = guess - offsetAt(guess, timeZone)
  const second = guess - offsetAt(first, timeZone)
  return second
}

/** Each local calendar day in `timeZone` from the day holding `from` to the day holding `to`. */
export function localDays(from: number, to: number, timeZone: string) {
  const start = wallParts(from, timeZone)
  const end = wallParts(to, timeZone)
  const last = Date.UTC(end.year, end.month - 1, end.day)
  const days: { year: number; month: number; day: number; weekday: number }[] =
    []
  for (
    let date = new Date(Date.UTC(start.year, start.month - 1, start.day));
    date.getTime() <= last;
    date = new Date(date.getTime() + DAY)
  ) {
    days.push({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      weekday: date.getUTCDay() || 7,
    })
  }
  return days
}

/** Sorted ISO UTC start times a visitor may ask for. */
export function openTimes(
  settings: BookingSettings,
  busy: Interval[],
  now: Date,
): string[] {
  const earliest = now.getTime() + settings.noticeHours * HOUR
  const windowEnd = now.getTime() + WINDOW_DAYS * DAY
  const length = settings.callMinutes * MINUTE
  const blocked = busy
    .map((interval) => [Date.parse(interval.start), Date.parse(interval.end)])
    .filter(([start, end]) => !Number.isNaN(start) && !Number.isNaN(end))

  const times: number[] = []
  for (const day of localDays(now.getTime(), windowEnd, settings.timeZone)) {
    if (!settings.weekdays.includes(day.weekday)) continue
    for (
      let minutes = settings.startHour * 60;
      minutes + settings.callMinutes <= settings.endHour * 60;
      minutes += settings.callMinutes
    ) {
      const start = wallToUtc(
        day.year,
        day.month,
        day.day,
        minutes,
        settings.timeZone,
      )
      const end = start + length
      if (start < earliest || start >= windowEnd) continue
      if (blocked.some(([from, to]) => from < end && to > start)) continue
      times.push(start)
    }
  }
  return times.sort((a, b) => a - b).map((t) => new Date(t).toISOString())
}

type SettingsRow = {
  weekdays: string
  start_hour: number
  end_hour: number
  call_minutes: number
  notice_hours: number
  time_zone: string
}

export async function readSettings(db: D1Database): Promise<BookingSettings> {
  const row = await db
    .prepare("SELECT * FROM booking_settings WHERE id = 1")
    .first<SettingsRow>()
  if (!row) throw new Error("no booking settings")
  return {
    weekdays: row.weekdays.split(",").map(Number),
    startHour: row.start_hour,
    endHour: row.end_hour,
    callMinutes: row.call_minutes,
    noticeHours: row.notice_hours,
    timeZone: row.time_zone,
  }
}

/** Throws when there is no calendar or it can't be read. */
export async function currentOpenTimes(
  db: D1Database,
  calendar: Calendar | null,
  now: Date,
): Promise<{ settings: BookingSettings; times: string[] }> {
  const settings = await readSettings(db)
  if (!calendar) throw new Error("no calendar")
  const busy = await calendar.busy(
    now,
    new Date(now.getTime() + WINDOW_DAYS * DAY),
  )
  return { settings, times: openTimes(settings, busy, now) }
}

export function availabilityApp(
  services: ContactServices | ((env: Env) => ContactServices),
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>()

  app.get("/", async (c) => {
    const { calendar, now } =
      typeof services === "function" ? services(c.env) : services
    const headers = { "Cache-Control": "no-store" }
    try {
      const { settings, times } = await currentOpenTimes(
        c.env.DB,
        calendar,
        now?.() ?? new Date(),
      )
      return c.json({ times, minutes: settings.callMinutes }, 200, headers)
    } catch {
      console.error("availability: no open times")
      let minutes = DEFAULT_CALL_MINUTES
      try {
        minutes = (await readSettings(c.env.DB)).callMinutes
      } catch {
        // Already logged once.
      }
      return c.json({ times: [], minutes }, 200, headers)
    }
  })

  return app
}
