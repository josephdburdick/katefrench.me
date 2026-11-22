import { localDays, wallToUtc } from "./availability"

/** ISO UTC strings. */
export type Interval = { start: string; end: string }

export type CalendarEvent = {
  start: string
  end: string
  summary: string
  description: string
  guest: { email: string; name: string }
}

export interface Calendar {
  /** Busy intervals only, with no titles, guests or other details. */
  busy(from: Date, to: Date): Promise<Interval[]>
  createEvent(event: CalendarEvent): Promise<{ videoLink: string }>
}

const LOCAL_ZONE = "America/New_York"

/** Busy 12:00 to 13:00 New York time every day, plus every event it created. */
export function localCalendar(): Calendar & { created: CalendarEvent[] } {
  const created: CalendarEvent[] = []
  return {
    created,
    async busy(from, to) {
      const lunches = localDays(from.getTime(), to.getTime(), LOCAL_ZONE).map(
        ({ year, month, day }) => ({
          start: new Date(
            wallToUtc(year, month, day, 12 * 60, LOCAL_ZONE),
          ).toISOString(),
          end: new Date(
            wallToUtc(year, month, day, 13 * 60, LOCAL_ZONE),
          ).toISOString(),
        }),
      )
      return [...lunches, ...created.map(({ start, end }) => ({ start, end }))]
        .filter(
          (interval) =>
            Date.parse(interval.end) > from.getTime() &&
            Date.parse(interval.start) < to.getTime(),
        )
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    },
    async createEvent(event) {
      created.push(event)
      console.log(`local calendar event: ${event.start}`)
      return { videoLink: `https://meet.example.com/local-${created.length}` }
    },
  }
}
